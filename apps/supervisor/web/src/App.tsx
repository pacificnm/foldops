import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { MachineDetail } from "./pages/MachineDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/machine/:hostname" element={<MachineDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
