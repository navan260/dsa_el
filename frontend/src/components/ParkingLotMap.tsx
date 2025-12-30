import React, { useEffect, useRef } from 'react';
import type { Node, Edge } from '../api';

interface ParkingLotMapProps {
    nodes: Node[];
    edges: Edge[];
    highlightPath?: number[];
}

export const ParkingLotMap: React.FC<ParkingLotMapProps> = ({ nodes, edges, highlightPath }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas settings
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Background - Concrete Floor
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, width, height);

        // Grid Scaling
        // We know layout is 3 rows x N cols (based on backend)
        // But let's be dynamic based on max x/y found
        const maxX = Math.max(...nodes.map(n => n.x), 5); // Default to at least 5 cols
        const maxY = Math.max(...nodes.map(n => n.y), 2); // Default to at least 3 rows (0,1,2)

        const marginX = 60;
        const marginY = 100;

        // Calculate cell size
        const availableWidth = width - 2 * marginX;
        const availableHeight = height - 2 * marginY;

        // We want proportional scaling
        const scaleX = availableWidth / maxX;
        const scaleY = availableHeight / maxY;

        // Slots need to be rectangular. 
        // Let's say a slot is 50px wide, 80px tall naturally.
        // We can define a fixed size or scale. Let's use computed scale.
        // But for a realistic look, slots in Row 0 and Row 2 should "face" the road (Row 1).

        const slotWidth = scaleX * 0.8;
        const slotHeight = scaleY * 0.8;

        const getNodePos = (node: Node) => {
            return {
                x: marginX + node.x * scaleX,
                y: marginY + node.y * scaleY
            };
        };

        // Draw Road Markings (Lane dividers)
        // The road is strictly on Row 1.
        ctx.beginPath();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([15, 15]); // Dashed line

        const roadNodes = nodes.filter(n => n.type === 'road').sort((a, b) => a.x - b.x);
        if (roadNodes.length > 1) {
            const first = getNodePos(roadNodes[0]);
            const last = getNodePos(roadNodes[roadNodes.length - 1]);
            // Draw line through center of road nodes
            // Adjust Y slightly if needed, but node center is fine for abstraction
            ctx.moveTo(first.x, first.y);
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        }
        ctx.setLineDash([]); // Reset dash

        // Draw Paths (Edges) - Visual guide only, maybe faint
        /*
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        edges.forEach(edge => {
          const sNode = nodes.find(n => n.id === edge.source);
          const tNode = nodes.find(n => n.id === edge.target);
          if (sNode && tNode) {
            const s = getNodePos(sNode);
            const t = getNodePos(tNode);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
          }
        });
        */

        // Draw Highlighting Path (Active Car Route)
        if (highlightPath && highlightPath.length > 1) {
            ctx.strokeStyle = '#00daff';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#00daff';
            ctx.shadowBlur = 15;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            const startNode = nodes.find(n => n.id === highlightPath[0]);
            if (startNode) {
                const s = getNodePos(startNode);
                ctx.moveTo(s.x, s.y);
            }

            for (let i = 1; i < highlightPath.length; i++) {
                const n = nodes.find(node => node.id === highlightPath[i]);
                if (n) {
                    const p = getNodePos(n);
                    ctx.lineTo(p.x, p.y);
                }
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw Nodes (Slots and Road Points)
        nodes.forEach(node => {
            const { x, y } = getNodePos(node);

            if (node.type === 'slot') {
                // Draw Parking Box
                // Offset so (x,y) is center
                const sx = x - slotWidth / 2;
                const sy = y - slotHeight / 2;

                // Fill
                if (node.filled) {
                    ctx.fillStyle = '#ff4d4d'; // Occupied Red
                } else {
                    // Empty Slot styling
                    ctx.fillStyle = '#444'; // Asphalt
                }

                ctx.fillRect(sx, sy, slotWidth, slotHeight);

                // Yellow Borders (Parking Lines)
                ctx.strokeStyle = '#facc15'; // Yellow-400
                ctx.lineWidth = 3;
                ctx.strokeRect(sx, sy, slotWidth, slotHeight);

                // Label / Car
                if (node.filled) {
                    // Draw "Car" shape (simple rectangle for top-down)
                    ctx.fillStyle = '#fff';
                    // A smaller rect inside
                    ctx.fillRect(sx + 5, sy + 10, slotWidth - 10, slotHeight - 20);

                    // Windshield
                    ctx.fillStyle = '#333';
                    if (node.y === 0) {
                        // Top row, car faces down (usually) or up? Let's say faces road (Down)
                        ctx.fillRect(sx + 7, sy + slotHeight - 25, slotWidth - 14, 8);
                    } else {
                        // Bottom row, car faces road (Up)
                        ctx.fillRect(sx + 7, sy + 15, slotWidth - 14, 8);
                    }

                    // Text ID
                    if (node.vehicle_id) {
                        ctx.fillStyle = '#000';
                        ctx.font = 'bold 10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(node.vehicle_id.split('-').pop() || '', x, y);
                    }
                } else {
                    // "FREE" text or ID
                    ctx.fillStyle = '#aaa';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // ctx.fillText(`S-${node.id}`, x, y);
                    ctx.fillText("P", x, y);
                }

            } else {
                // Road Node
                // Debug dot or Entry marker
                if (node.is_entry) {
                    ctx.fillStyle = '#ffff4d'; // Entry Yellow
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText("ENTRY", x - 40, y);
                }
            }
        });

    }, [nodes, edges, highlightPath]);

    return (
        <div className="flex justify-center items-center p-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
            <canvas
                ref={canvasRef}
                width={800} // Wider for road
                height={500}
                className="bg-[#2a2a2a] rounded-lg shadow-inner"
            />
        </div>
    );
};
