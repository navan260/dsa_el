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

        // Grid Scaling
        // Assuming 5x5 grid based on backend default
        const cols = 5;
        const rows = 5;
        const margin = 60;
        const spacingX = (width - 2 * margin) / (cols - 1 || 1);
        const spacingY = (height - 2 * margin) / (rows - 1 || 1);

        const getNodePos = (idx: number) => {
            const node = nodes.find(n => n.id === idx);
            if (!node) return { x: 0, y: 0 };
            // Backend (r, c) -> (y, x)
            // node.x is col, node.y is row from our backend logic
            return {
                x: margin + node.x * spacingX,
                y: margin + node.y * spacingY
            };
        };

        // Draw Edges
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        edges.forEach(edge => {
            const start = getNodePos(edge.source);
            const end = getNodePos(edge.target);

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        });

        // Highlight Path
        if (highlightPath && highlightPath.length > 1) {
            ctx.strokeStyle = '#00daff'; // Cyan glow
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00daff';
            ctx.lineWidth = 6;
            ctx.beginPath();

            const startNode = getNodePos(highlightPath[0]);
            ctx.moveTo(startNode.x, startNode.y);

            for (let i = 1; i < highlightPath.length; i++) {
                const pos = getNodePos(highlightPath[i]);
                ctx.lineTo(pos.x, pos.y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw Nodes
        nodes.forEach(node => {
            const { x, y } = getNodePos(node.id);

            // Determine Color
            let color = node.filled ? '#ff4d4d' : '#4dff88'; // Red if filled, Green if empty
            if (node.is_entry) color = '#ffff4d'; // Yellow for entry

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fill();

            // Outline
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label (ID or Vehicle)
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (node.vehicle_id) {
                ctx.fillText(node.vehicle_id, x, y);
            } else if (node.is_entry) {
                ctx.fillText("IN", x, y);
            } else {
                // Show slot ID slightly lighter
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillText(node.id.toString(), x, y);
            }
        });

    }, [nodes, edges, highlightPath]);

    return (
        <div className="flex justify-center items-center p-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
            <canvas
                ref={canvasRef}
                width={600}
                height={600}
                className="bg-gray-900 rounded-lg"
            />
        </div>
    );
};
