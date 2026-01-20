import React, { useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '../api';

interface ParkingLotMapProps {
    nodes: Node[];
    edges: Edge[];
    highlightPath?: number[];
    fullscreen?: boolean;
}

export const ParkingLotMap: React.FC<ParkingLotMapProps> = ({ nodes, edges, highlightPath, fullscreen }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

    // Handle resize
    useEffect(() => {
        if (!fullscreen || !containerRef.current) return;

        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        updateDimensions();
        const resizeObserver = new ResizeObserver(updateDimensions);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, [fullscreen]);

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
        const maxX = Math.max(...nodes.map(n => n.x), 5);
        const maxY = Math.max(...nodes.map(n => n.y), 2);

        const marginX = 60;
        const marginY = 100;

        const availableWidth = width - 2 * marginX;
        const availableHeight = height - 2 * marginY;

        const scaleX = availableWidth / maxX;
        const scaleY = availableHeight / maxY;

        const slotWidth = scaleX * 0.95;
        const slotHeight = scaleY * 0.95;

        // 2-Wheeler slots are smaller but still bigger than before
        const slotWidth2W = slotWidth * 0.75;
        const slotHeight2W = slotHeight * 0.85;

        const getNodePos = (node: Node) => {
            return {
                x: marginX + node.x * scaleX,
                y: marginY + node.y * scaleY
            };
        };

        // Draw Zone Labels
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';

        // Find 2W zones and their positions
        const twoWheelerNodes = nodes.filter(n => n.slot_category === '2w');
        const fourWheelerNodes = nodes.filter(n => n.slot_category === '4w');

        if (twoWheelerNodes.length > 0) {
            const midX = marginX + (maxX / 2) * scaleX;
            ctx.fillStyle = '#4ade80'; // Green

            // Find min and max Y positions for 2W zones
            const minY2W = Math.min(...twoWheelerNodes.map(n => n.y));
            const maxY2W = Math.max(...twoWheelerNodes.map(n => n.y));

            // Top 2W zone label
            if (minY2W === 0) {
                ctx.fillText('🏍️ 2-WHEELER ZONE', midX, marginY - 30);
            }

            // Bottom 2W zone label (if different from top)
            if (maxY2W > 0 && maxY2W === maxY) {
                ctx.fillText('🏍️ 2-WHEELER ZONE', midX, height - 30);
            }
        }

        // Draw 4W zone label on the left side (in the empty space)
        if (fourWheelerNodes.length > 0) {
            const avgY4W = fourWheelerNodes.reduce((sum, n) => sum + n.y, 0) / fourWheelerNodes.length;
            const labelY = marginY + avgY4W * scaleY;
            const labelX = marginX / 2;  // Position in left margin area

            // Draw vertical label
            ctx.save();
            ctx.translate(labelX, labelY);
            ctx.rotate(-Math.PI / 2);  // Rotate 90 degrees counter-clockwise

            ctx.fillStyle = '#facc15'; // Yellow
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🚗 4-WHEELER', 0, 0);

            ctx.restore();
        }

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
                const is2W = node.slot_category === '2w';
                const currentSlotWidth = is2W ? slotWidth2W : slotWidth;
                const currentSlotHeight = is2W ? slotHeight2W : slotHeight;

                // Draw Parking Box
                const sx = x - currentSlotWidth / 2;
                const sy = y - currentSlotHeight / 2;

                // Fill
                if (node.filled) {
                    ctx.fillStyle = is2W ? '#22c55e' : '#ff4d4d'; // Green for 2W, Red for 4W
                } else {
                    ctx.fillStyle = '#444'; // Asphalt
                }

                ctx.fillRect(sx, sy, currentSlotWidth, currentSlotHeight);

                // Borders (Different colors for 2W vs 4W)
                ctx.strokeStyle = is2W ? '#4ade80' : '#facc15'; // Green-400 for 2W, Yellow-400 for 4W
                ctx.lineWidth = 3;
                ctx.strokeRect(sx, sy, currentSlotWidth, currentSlotHeight);

                // Label / Vehicle
                if (node.filled) {
                    if (node.vehicle_type === '2w') {
                        // Draw motorcycle shape (simple top-down)
                        ctx.fillStyle = '#fff';
                        // Body
                        ctx.fillRect(sx + currentSlotWidth * 0.3, sy + 5, currentSlotWidth * 0.4, currentSlotHeight - 10);
                        // Wheels
                        ctx.fillStyle = '#333';
                        ctx.beginPath();
                        ctx.arc(sx + currentSlotWidth / 2, sy + 8, 4, 0, Math.PI * 2);
                        ctx.arc(sx + currentSlotWidth / 2, sy + currentSlotHeight - 8, 4, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Draw car shape (top-down)
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(sx + 5, sy + 10, currentSlotWidth - 10, currentSlotHeight - 20);

                        // Windshield
                        ctx.fillStyle = '#333';
                        if (node.y === 0) {
                            ctx.fillRect(sx + 7, sy + currentSlotHeight - 25, currentSlotWidth - 14, 8);
                        } else {
                            ctx.fillRect(sx + 7, sy + 15, currentSlotWidth - 14, 8);
                        }
                    }

                    // Text ID - use white text with black outline for visibility
                    if (node.vehicle_id) {
                        const displayId = node.vehicle_id.split('-').pop() || node.vehicle_id;
                        ctx.font = 'bold 10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        // Draw outline for visibility
                        ctx.strokeStyle = '#000';
                        ctx.lineWidth = 2;
                        ctx.strokeText(displayId, x, y);

                        // Draw white text
                        ctx.fillStyle = '#fff';
                        ctx.fillText(displayId, x, y);
                    }
                } else {
                    // Free slot indicator
                    ctx.fillStyle = is2W ? '#4ade80' : '#aaa';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(is2W ? "🏍️" : "P", x, y);
                }

            } else {
                // Road Node
                if (node.is_entry) {
                    ctx.fillStyle = '#ffff4d'; // Entry Yellow
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText("ENTRY ↓", x, y - 15);
                }
            }
        });

    }, [nodes, edges, highlightPath, dimensions]);

    if (fullscreen) {
        return (
            <div ref={containerRef} className="absolute inset-0 bg-gray-800">
                <canvas
                    ref={canvasRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    className="bg-[#2a2a2a]"
                />
            </div>
        );
    }

    return (
        <div className="flex justify-center items-center p-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
            <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className="bg-[#2a2a2a] rounded-lg shadow-inner"
            />
        </div>
    );
};
