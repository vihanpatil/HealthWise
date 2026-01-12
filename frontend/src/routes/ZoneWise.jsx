import React from "react";
import { Link } from "react-router-dom";

export default function ZoneWise() {
  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>ZoneWise</h2>
        <Link to="/rootwise">← Back to RootWise</Link>
      </header>

      {/* WorkoutLogger */}
      {/* SleepLogger */}
      {/* ZoneDashboard (summary) */}
    </div>
  );
}
