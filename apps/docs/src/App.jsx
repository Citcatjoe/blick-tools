import React, { useState } from 'react';
import { WelcomeUI } from '@rms/ui';

function App() {
  const [brand, setBrand] = useState('blick');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{ width: '250px', background: '#ffffff', borderRight: '1px solid #e5e7eb', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '2rem' }}>@rms/ui</h1>
        
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#6b7280' }}>
            Marque Active (Brand)
          </label>
          <select 
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
          >
            <option value="blick">Blick</option>
            <option value="letemps">Le Temps</option>
            <option value="illustre">L'Illustré</option>
          </select>
        </div>

        <nav>
          <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>Composants</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ padding: '0.5rem 0', color: '#3b82f6', cursor: 'pointer' }}>WelcomeUI</li>
            {/* Ajoute les autres composants ici au fur et à mesure */}
          </ul>
        </nav>
      </div>

      {/* Contenu principal */}
      <div style={{ flex: 1, padding: '3rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>WelcomeUI</h2>
        <p style={{ color: '#4b5563', marginBottom: '2rem' }}>Composant de test pour valider l'import du package.</p>
        
        <div style={{ 
          padding: '2rem', 
          background: '#ffffff', 
          border: '1px solid #e5e7eb', 
          borderRadius: '0.5rem',
          // C'est ici qu'on injecterait le data-brand ou la classe CSS de la marque
          // ex: className={`theme-${brand}`}
        }}>
          <WelcomeUI />
        </div>
      </div>
    </div>
  );
}

export default App;