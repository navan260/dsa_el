import { useState, useEffect } from 'react';
import { ParkingLotMap } from './components/ParkingLotMap';
import { getStatus, parkVehicle, removeVehicle } from './api';
import type { ParkingState } from './api';

function App() {
  const [state, setState] = useState<ParkingState>({ nodes: [], edges: [] });
  const [vehicleId, setVehicleId] = useState('');
  const [path, setPath] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch initial state
  const refreshStatus = async () => {
    try {
      const data = await getStatus();
      setState(data);
    } catch (e) {
      console.error(e);
      setMessage("Error connecting to backend");
    }
  };

  useEffect(() => {
    refreshStatus();
    // Poll every 2 seconds to keep in sync if multiple clients
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handlePark = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setMessage('');
    setPath([]);
    try {
      const res = await parkVehicle(vehicleId);
      setMessage(res.message);
      setPath(res.path);
      await refreshStatus();
      setVehicleId(''); // Clear input
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async (vId: string) => {
    setLoading(true);
    setMessage('');
    setPath([]);
    try {
      const res = await removeVehicle(vId);
      setMessage(res.message);
      await refreshStatus();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-900 text-white flex flex-col items-center py-3">
      {/* <h1 className="text-4xl font-extrabold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        Smart Parking System
      </h1> */}

      <div className="flex gap-8 flex-wrap justify-center w-full max-w-6xl">
        {/* Map Section */}
        <div className="flex-1 min-w-[600px] flex justify-center">
          <ParkingLotMap nodes={state.nodes} edges={state.edges} highlightPath={path} />
        </div>

        {/* Controls Section */}
        <div className="w-96 bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl h-fit">
          <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">Controls</h2>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-400">Park A Car</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="Enter Vehicle ID"
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handlePark}
                disabled={loading || !vehicleId}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded font-semibold transition-colors"
              >
                Park
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Parked Vehicles</h3>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {state.nodes.filter(n => n.filled && n.vehicle_id).map(n => (
                <div key={n.id} className="flex justify-between items-center bg-gray-700 p-2 rounded hover:bg-gray-600 transition-colors">
                  <span className="font-mono text-yellow-300">{n.vehicle_id}</span>
                  <span className="text-xs text-gray-400 mr-auto ml-2">(Slot {n.id})</span>
                  <button
                    onClick={() => n.vehicle_id && handleLeave(n.vehicle_id)}
                    disabled={loading}
                    className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/40 px-2 py-1 rounded transition-colors"
                  >
                    Depart
                  </button>
                </div>
              ))}
              {state.nodes.every(n => !n.filled || !n.vehicle_id) && (
                <p className="text-gray-500 italic text-sm text-center py-4">No vehicles parked.</p>
              )}
            </div>
          </div>

          {message && (
            <div className={`p-3 rounded text-sm ${message.startsWith('Error') ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'} animate-pulse`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
