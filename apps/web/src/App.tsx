import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { DiagramPage } from "./pages/DiagramPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/d/:id" element={<DiagramPage />} />
      </Routes>
    </BrowserRouter>
  );
}
