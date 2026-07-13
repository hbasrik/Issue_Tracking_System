import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AnalysisPage from './pages/AnalysisPage';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <nav className="flex items-center gap-6">
          <span className="text-lg font-semibold">Karea</span>
          <Link to="/" className="text-sm text-slate-300 hover:text-white">
            Dashboard
          </Link>
          <Link to="/analysis" className="text-sm text-slate-300 hover:text-white">
            Analysis
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
        </Routes>
      </main>
    </div>
  );
}
