import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RootWise from "./routes/RootWise.jsx";
import ZoneWise from "./routes/ZoneWise.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/rootwise" replace />} />
        <Route path="/rootwise" element={<RootWise />} />
        <Route path="/zonewise" element={<ZoneWise />} />
      </Routes>
    </BrowserRouter>
  );
}
