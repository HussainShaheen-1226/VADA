import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AuthProvider, { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import ArrivalsPage from "./pages/ArrivalsPage";
import DeparturesPage from "./pages/DeparturesPage";
import MyFlightsPage from "./pages/MyFlightsPage";
import AdminPage from "./pages/AdminPage";

function Private({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage/>} />
        <Route path="/" element={<Private><ArrivalsPage userId="me"/></Private>} />
        <Route path="/departures" element={<Private><DeparturesPage userId="me"/></Private>} />
        <Route path="/my" element={<Private><MyFlightsPage userId="me"/></Private>} />
        <Route path="/admin" element={<Private><AdminPage/></Private>} />
        <Route path="*" element={<Navigate to="/" replace/>} />
      </Routes>
    </AuthProvider>
  );
}
