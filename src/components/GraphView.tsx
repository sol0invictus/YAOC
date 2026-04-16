import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { useVault } from '../hooks/useVault'
import '../styles/graph.css'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  degree: number
}

interface GraphLink {
  source: string
  target: string
}

interface GraphViewProps {
  isOpen: boolean
  onClose: () => void
  activeNoteId: string | null
  onNavigate: (noteId: string) => void
}

export default function GraphView({ isOpen, onClose, activeNoteId, onNavigate }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { notes, vaultDb } = useVault()

  const buildGraph = useCallback(async () => {
    const svg = svgRef.current
    if (!svg) return

    // Clear previous render
    d3.select(svg).selectAll('*').remove()

    const links = await vaultDb.links.toArray()

    // Build a name→id map
    const nameToId = new Map<string, string>()
    for (const note of notes) {
      nameToId.set(note.name.toLowerCase(), note.id)
    }

    // Nodes
    const nodes: GraphNode[] = notes.slice(0, 500).map((n) => ({
      id: n.id,
      name: n.name,
      degree: 0,
    }))
    const nodeById = new Map(nodes.map((n) => [n.id, n]))

    // Edges (only between nodes we have)
    const edges: GraphLink[] = []
    for (const link of links) {
      const targetId = nameToId.get(link.targetName.toLowerCase())
      if (targetId && nodeById.has(link.sourceNoteId) && nodeById.has(targetId)) {
        edges.push({ source: link.sourceNoteId, target: targetId })
        nodeById.get(link.sourceNoteId)!.degree++
        nodeById.get(targetId)!.degree++
      }
    }

    const width = svg.clientWidth || 800
    const height = svg.clientHeight || 600

    const svgSel = d3.select(svg)

    // Zoom container
    const g = svgSel.append('g')

    svgSel.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => g.attr('transform', event.transform))
    )

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(edges)
        .id((d) => d.id)
        .distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(16))

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#45455e')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5)

    // Draw nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => Math.min(4 + d.degree, 12))
      .attr('fill', (d) => d.id === activeNoteId ? '#cba6f7' : '#89b4fa')
      .attr('stroke', (d) => d.id === activeNoteId ? '#f5c2e7' : 'none')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => onNavigate(d.id))
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Labels (only for high-degree nodes)
    const label = g.append('g')
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(nodes.filter((d) => d.degree > 1 || d.id === activeNoteId))
      .join('text')
      .attr('class', 'graph-node-label')
      .attr('dy', -8)
      .text((d) => d.name)

    // Tooltip on hover
    node.append('title').text((d) => d.name)

    simulation.on('tick', () => {
      link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('x1', (d) => ((d.source as any) as GraphNode).x ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('y1', (d) => ((d.source as any) as GraphNode).y ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('x2', (d) => ((d.target as any) as GraphNode).x ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('y2', (d) => ((d.target as any) as GraphNode).y ?? 0)

      node
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0)

      label
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0)
    })

    return () => simulation.stop()
  }, [notes, vaultDb, activeNoteId, onNavigate])

  useEffect(() => {
    if (!isOpen) return
    // Small delay to let the SVG render and get dimensions
    const timer = setTimeout(() => { buildGraph() }, 50)
    return () => clearTimeout(timer)
  }, [isOpen, buildGraph])

  if (!isOpen) return null

  return (
    <div className="graph-overlay">
      <div className="graph-header">
        <span className="graph-title">Graph View</span>
        <span className="graph-legend">click to open · drag to reposition · scroll to zoom</span>
        <button className="graph-close" onClick={onClose} title="Close">×</button>
      </div>
      <div className="graph-body">
        {notes.length === 0 && (
          <div className="graph-empty">No notes in this vault</div>
        )}
        <svg ref={svgRef} className="graph-svg" />
      </div>
    </div>
  )
}
