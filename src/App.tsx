import { Routes, Route } from 'react-router';
import { DataProvider } from './context/DataContext';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import EquipmentDetail from './pages/EquipmentDetail';
import Efficiency from './pages/Efficiency';
import YieldDashboard from './pages/YieldDashboard';

export default function App() {
  return (
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/equipment/:name" element={<EquipmentDetail />} />
          <Route path="/efficiency" element={<Efficiency />} />
          <Route path="/yield" element={<YieldDashboard />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}
