import './index.css';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initClientApiBridge } from './services/clientApiBridge';

// Initialize in-browser API bridge to guarantee 100% functionality on static deploys
initClientApiBridge();

createRoot(document.getElementById('root')!).render(<App />);
