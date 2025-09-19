import { useState } from "react";
import Sidebar from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";
import Dashboard from "./components/DashBoard/Dashboard";
import Overview from "./components/DashBoard/Overview";
import Reports from "./components/DashBoard/Reports";
import Insights from "./components/DashBoard/CustomsPredictor";
import Admin from "./components/Admin/Admin";
import MyItems from "./components/MyItems/MyItems";
function App() {
  const [sideBarCollapsed, setSideBarCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 
  dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-all duration-500"
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          collapsed={sideBarCollapsed}
          onToggle={() => setSideBarCollapsed(!sideBarCollapsed)}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header sdiebarCollapsed={sideBarCollapsed} onToggleSidebar={() => setSideBarCollapsed(!sideBarCollapsed)} />

          <main className="flex-1 overflow-auto bg-transparent">
            <div className="p-6 overflow-y-auto">
              {currentPage === "dashboard" && <Dashboard />}
              {currentPage === "overview" && <Overview />}
              {currentPage === "reports" && <Reports />}
              {currentPage === "insights" && <Insights />}

              {currentPage === "admin" && <Admin />}
              {currentPage === "myitems" && <MyItems />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
