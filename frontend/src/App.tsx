import { useState, useEffect } from 'react';
import { ParkingLotMap } from './components/ParkingLotMap';
import { getStatus, parkVehicle, removeVehicle, configureGrid } from './api';
import type { ParkingState, GridConfig } from './api';

function App() {
  const [state, setState] = useState<ParkingState>({ nodes: [], edges: [] });
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleType, setVehicleType] = useState<'2w' | '4w'>('4w');
  const [path, setPath] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [gridConfig, setGridConfig] = useState<GridConfig>({
    rows_2w_top: 1,
    rows_2w_bottom: 1,
    rows_4w: 8,
    cols: 19,
    cols_4w: 10
  });

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
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handlePark = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setMessage('');
    setPath([]);
    try {
      const res = await parkVehicle(vehicleId, vehicleType);
      setMessage(res.message);
      setPath(res.path);
      await refreshStatus();
      setVehicleId('');
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

  const handleConfigure = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await configureGrid(gridConfig);
      setMessage(`Grid configured: ${res.rows} rows, ${res.cols} cols`);
      await refreshStatus();
      setShowConfig(false);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Fullscreen Map */}
      <div className="flex-1 relative">
        <ParkingLotMap nodes={state.nodes} edges={state.edges} highlightPath={path} fullscreen />

        {/* Floating Stats Overlay */}
        {state.stats && (
          <div className="absolute top-4 left-4 flex gap-3">
            <div className="bg-gray-800/90 backdrop-blur border border-green-700 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-green-400">🏍️</span>
              <span className="font-bold text-green-300">{state.stats['2w'].available}/{state.stats['2w'].total}</span>
            </div>
            <div className="bg-gray-800/90 backdrop-blur border border-yellow-700 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-yellow-400">🚗</span>
              <span className="font-bold text-yellow-300">{state.stats['4w'].available}/{state.stats['4w'].total}</span>
            </div>
          </div>
        )}

        {/* Toggle Panel Button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="absolute bottom-4 right-4 bg-gray-800/90 backdrop-blur border border-gray-600 rounded-full w-12 h-12 flex items-center justify-center text-xl hover:bg-gray-700 transition-colors shadow-lg"
        >
          {showPanel ? '▼' : '▲'}
        </button>

        {/* Message Toast */}
        {message && (
          <div className={`absolute top-4 right-4 p-3 rounded-lg shadow-lg ${message.startsWith('Error') ? 'bg-red-900/90 text-red-200' : 'bg-green-900/90 text-green-200'}`}>
            {message}
          </div>
        )}
      </div>

      {/* Collapsible Bottom Panel */}
      <div className={`bg-gray-800 border-t border-gray-700 transition-all duration-300 ${showPanel ? 'h-auto max-h-80' : 'h-0 overflow-hidden'}`}>
        <div className="p-4 overflow-y-auto max-h-72">
          <div className="flex flex-wrap gap-4 items-start">

            {/* Park Vehicle Section */}
            <div className="flex-1 min-w-[250px]">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setVehicleType('2w')}
                  className={`px-3 py-1.5 rounded font-semibold text-sm transition-all ${vehicleType === '2w'
                    ? 'bg-green-600 text-white ring-2 ring-green-400'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🏍️ 2W
                </button>
                <button
                  onClick={() => setVehicleType('4w')}
                  className={`px-3 py-1.5 rounded font-semibold text-sm transition-all ${vehicleType === '4w'
                    ? 'bg-yellow-600 text-white ring-2 ring-yellow-400'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  🚗 4W
                </button>
                <input
                  type="text"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder="Vehicle ID"
                  onKeyDown={(e) => e.key === 'Enter' && handlePark()}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handlePark}
                  disabled={loading || !vehicleId}
                  className={`px-4 py-1.5 rounded font-semibold text-sm disabled:opacity-50 ${vehicleType === '2w' ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                >
                  Park
                </button>
              </div>
            </div>

            {/* Parked Vehicles */}
            <div className="flex-1 min-w-[300px]">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Parked Vehicles</h3>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {state.nodes.filter(n => n.filled && n.vehicle_id).map(n => (
                  <div key={n.id} className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${n.vehicle_type === '2w' ? 'bg-green-900/50 border border-green-700' : 'bg-yellow-900/50 border border-yellow-700'}`}>
                    <span>{n.vehicle_type === '2w' ? '🏍️' : '🚗'}</span>
                    <span className="font-mono">{n.vehicle_id}</span>
                    <button
                      onClick={() => n.vehicle_id && handleLeave(n.vehicle_id)}
                      disabled={loading}
                      className="text-red-400 hover:text-red-300 ml-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {state.nodes.every(n => !n.filled || !n.vehicle_id) && (
                  <span className="text-gray-500 italic text-sm">No vehicles parked</span>
                )}
              </div>
            </div>

            {/* Configure Button */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-semibold"
              >
                ⚙️ Configure
              </button>
            </div>
          </div>

          {/* Grid Configuration Panel */}
          {showConfig && (
            <div className="mt-4 p-4 bg-purple-900/30 border border-purple-700 rounded-lg">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs text-gray-400 block">2W Top</label>
                  <input type="number" min="0" max="5" value={gridConfig.rows_2w_top}
                    onChange={(e) => setGridConfig({ ...gridConfig, rows_2w_top: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">2W Bottom</label>
                  <input type="number" min="0" max="5" value={gridConfig.rows_2w_bottom}
                    onChange={(e) => setGridConfig({ ...gridConfig, rows_2w_bottom: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">4W Rows</label>
                  <input type="number" min="1" max="20" value={gridConfig.rows_4w}
                    onChange={(e) => setGridConfig({ ...gridConfig, rows_4w: parseInt(e.target.value) || 1 })}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">2W Cols</label>
                  <input type="number" min="5" max="30" value={gridConfig.cols}
                    onChange={(e) => setGridConfig({ ...gridConfig, cols: parseInt(e.target.value) || 5 })}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">4W Cols</label>
                  <input type="number" min="1" max="20" value={gridConfig.cols_4w}
                    onChange={(e) => setGridConfig({ ...gridConfig, cols_4w: parseInt(e.target.value) || 1 })}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <button
                  onClick={handleConfigure}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-1.5 rounded font-semibold text-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
