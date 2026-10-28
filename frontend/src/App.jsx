import { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { UIProvider } from './ui';
import { Public, Multi } from './Public';
import { Login, Reset, Admin } from './Admin';

export default function App() {
  // Results live only in memory: a page refresh clears everything.
  const [st, setSt] = useState({ pages: [], cur: 0 });
  const add = useCallback(ps => setSt(s => ({ pages: [...s.pages, ...ps], cur: s.pages.length })), []);
  const store = { st, setSt, add };
  return (
    <UIProvider>
      <Routes>
        <Route path="/" element={<Public store={store} />} />
        <Route path="/check-price" element={<Public store={store} />} />
        <Route path="/multi" element={<Multi store={store} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </UIProvider>
  );
}
