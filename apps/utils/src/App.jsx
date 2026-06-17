import { useState, useEffect } from 'react';
import { db, firebaseConfig, prodDb, prodConfig } from '@rms/services';
import { doc, setDoc, addDoc, getDocs, collection, Timestamp } from 'firebase/firestore';

function App() {
  const [collectionName, setCollectionName] = useState('embeds');
  const [activeTab, setActiveTab] = useState('transfert'); // 'transfert' or 'refactor'
  
  // Editor State
  const [docId, setDocId] = useState('');
  const [jsonText, setJsonText] = useState('{}');
  const [parsedData, setParsedData] = useState({});
  const [middleMode, setMiddleMode] = useState('edit'); // 'edit' or 'parse'
  const [inputText, setInputText] = useState('');

  // Database 1 (Prod) state
  const [prodDocs, setProdDocs] = useState([]);
  const [prodFilter, setProdFilter] = useState('');
  const [prodStatus, setProdStatus] = useState({ status: 'idle', message: 'Non connecté' });

  // Database 2 (Test) state
  const [testDocs, setTestDocs] = useState([]);
  const [testFilter, setTestFilter] = useState('');
  const [testStatus, setTestStatus] = useState({ status: 'idle', message: 'Non connecté' });

  // Type Filter state
  const [prodTypeFilter, setProdTypeFilter] = useState('all');
  const [testTypeFilter, setTestTypeFilter] = useState('all');

  // Loading/saving state
  const [isSaving, setIsSaving] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [alert, setAlert] = useState(null);

  const testProjectId = firebaseConfig.projectId || 'Test DB';
  const prodProjectId = prodConfig?.projectId || 'Prod DB';
  const isProdAvailable = !!prodDb;

  const showToast = (type, message) => {
    setAlert({ type, message });
    if (type === 'success') {
      setTimeout(() => setAlert(null), 8000);
    } else {
      setTimeout(() => setAlert(null), 5000);
    }
  };

  // Fetch both databases on mount & whenever collection changes
  useEffect(() => {
    loadBothDbs();
  }, [collectionName]);

  const loadBothDbs = () => {
    fetchProdDocs();
    fetchTestDocs();
  };

  // Fetch BDD 1 (Production)
  const fetchProdDocs = async () => {
    if (!prodDb) {
      setProdStatus({ status: 'error', message: 'Non configuré (.env-prod)' });
      return;
    }

    setProdStatus({ status: 'loading', message: 'Chargement...' });
    try {
      const colRef = collection(prodDb, collectionName.trim());
      const querySnapshot = await getDocs(colRef);
      const docs = [];
      querySnapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setProdDocs(docs);
      setProdStatus({ status: 'connected', message: prodProjectId });
    } catch (error) {
      console.error(error);
      setProdStatus({ status: 'error', message: `Erreur: ${error.message}` });
    }
  };

  // Fetch BDD 2 (Test)
  const fetchTestDocs = async () => {
    setTestStatus({ status: 'loading', message: 'Chargement...' });
    try {
      const colRef = collection(db, collectionName.trim());
      const querySnapshot = await getDocs(colRef);
      const docs = [];
      querySnapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setTestDocs(docs);
      setTestStatus({ status: 'connected', message: testProjectId });
    } catch (error) {
      console.error(error);
      setTestStatus({ status: 'error', message: `Erreur: ${error.message}` });
    }
  };

  // Load a document into the middle editor
  const handleLoadToEditor = (docItem) => {
    const { id, ...docData } = docItem;
    const formattedData = formatTimestampsForJson(docData);
    setParsedData(formattedData);
    setJsonText(JSON.stringify(formattedData, null, 2));
    setDocId(id);
    setMiddleMode('edit');
    showToast('info', `Document "${id}" chargé dans l'éditeur.`);
  };

  // Clone from BDD 1 to BDD 2 (Left to Right)
  const handleCloneLeftToRight = async (sourceDoc) => {
    setIsCloning(true);
    showToast('info', `Clonage de "${sourceDoc.id}" vers BDD 2...`);
    try {
      const { id, ...docData } = sourceDoc;
      const firestorePayload = convertToFirestoreTypes(docData);
      
      const targetDocRef = doc(db, collectionName.trim(), id);
      await setDoc(targetDocRef, firestorePayload);
      
      showToast('success', `🎉 Document "${id}" cloné avec succès dans BDD 2 !`);
      fetchTestDocs(); // reload target list
    } catch (error) {
      console.error(error);
      showToast('error', `Erreur de clonage: ${error.message}`);
    } finally {
      setIsCloning(false);
    }
  };

  // Clone from BDD 2 to BDD 1 (Right to Left)
  const handleCloneRightToLeft = async (sourceDoc) => {
    if (!prodDb) {
      showToast('error', 'La BDD de production n\'est pas connectée.');
      return;
    }
    setIsCloning(true);
    showToast('info', `Clonage de "${sourceDoc.id}" vers BDD 1 (Prod)...`);
    try {
      const { id, ...docData } = sourceDoc;
      const firestorePayload = convertToFirestoreTypes(docData);
      
      const targetDocRef = doc(prodDb, collectionName.trim(), id);
      await setDoc(targetDocRef, firestorePayload);
      
      showToast('success', `🎉 Document "${id}" cloné avec succès dans BDD 1 !`);
      fetchProdDocs(); // reload target list
    } catch (error) {
      console.error(error);
      showToast('error', `Erreur de clonage: ${error.message}`);
    } finally {
      setIsCloning(false);
    }
  };

  // Format Timestamps in database items into JSON ISO strings
  const formatTimestampsForJson = (val) => {
    if (val === null) return null;
    if (val instanceof Date) return val.toISOString();
    if (val && typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        return val.toDate().toISOString();
      }
      if (val.seconds !== undefined && val.nanoseconds !== undefined) {
        return new Date(val.seconds * 1000).toISOString();
      }
      const copy = {};
      for (let k in val) {
        copy[k] = formatTimestampsForJson(val[k]);
      }
      return copy;
    }
    if (Array.isArray(val)) {
      return val.map(item => formatTimestampsForJson(item));
    }
    return val;
  };

  // Convert raw value and type string to actual JS values (for text parser)
  const parsePrimitive = (valStr, type) => {
    const cleanVal = valStr.trim();
    switch (type.toLowerCase()) {
      case 'int64':
      case 'integer':
      case 'number':
      case 'double':
        return Number(cleanVal) || 0;
      case 'boolean':
        return cleanVal === 'true';
      case 'null':
        return null;
      case 'timestamp':
        return parseFirestoreDate(cleanVal);
      case 'string':
      default:
        if (cleanVal.startsWith('"') && cleanVal.endsWith('"')) {
          return cleanVal.slice(1, -1);
        }
        return cleanVal;
    }
  };

  // Parse French & English Firestore Timestamps
  const parseFirestoreDate = (str) => {
    if (!str) return new Date();
    const timestamp = Date.parse(str);
    if (!isNaN(timestamp)) {
      return new Date(timestamp);
    }
    const cleanStr = str.toLowerCase().replace(' à ', ' ').replace(' at ', ' ').trim();
    const months = {
      'janvier': 0, 'jan': 0, 'février': 1, 'fev': 1, 'fév': 1,
      'mars': 2, 'mar': 2, 'avril': 3, 'avr': 3, 'mai': 4,
      'juin': 5, 'jui': 5, 'juillet': 6, 'jul': 6, 'août': 7,
      'aout': 7, 'aoû': 7, 'septembre': 8, 'sep': 8, 'octobre': 9,
      'oct': 9, 'novembre': 10, 'nov': 10, 'décembre': 11, 'dec': 11, 'déc': 11
    };
    
    const regex = /^(\d+)\s+([a-zéû]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(.*)$/;
    const match = cleanStr.match(regex);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2];
      const year = parseInt(match[3], 10);
      const hour = parseInt(match[4], 10);
      const minute = parseInt(match[5], 10);
      const second = parseInt(match[6], 10);
      const tz = match[7] || '';
      
      const month = months[monthStr] !== undefined ? months[monthStr] : 0;
      
      let tzOffset = 'Z';
      const tzMatch = tz.match(/utc([+-])(\d+)/);
      if (tzMatch) {
        const sign = tzMatch[1];
        const hours = tzMatch[2].padStart(2, '0');
        tzOffset = `${sign}${hours}:00`;
      }
      
      const monthPad = String(month + 1).padStart(2, '0');
      const dayPad = String(day).padStart(2, '0');
      const hrPad = String(hour).padStart(2, '0');
      const minPad = String(minute).padStart(2, '0');
      const secPad = String(second).padStart(2, '0');
      
      const isoStr = `${year}-${monthPad}-${dayPad}T${hrPad}:${minPad}:${secPad}${tzOffset}`;
      const parsed = Date.parse(isoStr);
      if (!isNaN(parsed)) {
        return new Date(parsed);
      }
    }
    return new Date();
  };

  // Text Parser logic
  const handleParse = () => {
    if (!inputText.trim()) {
      showToast('error', 'Veuillez saisir du texte à parser.');
      return;
    }

    try {
      const lines = inputText.split('\n');
      const parsedLines = [];
      
      for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const leadingSpaces = line.length - line.trimStart().length;
        parsedLines.push({ text: trimmed, indent: leadingSpaces });
      }
      
      if (parsedLines.length === 0) {
        showToast('error', 'Aucune ligne valide trouvée.');
        return;
      }

      const root = { text: 'root', indent: -1, children: [] };
      const stack = [root];
      
      for (let node of parsedLines) {
        while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent) {
          stack.pop();
        }
        const parent = stack[stack.length - 1];
        const newNode = { text: node.text, indent: node.indent, children: [] };
        parent.children.push(newNode);
        stack.push(newNode);
      }

      const parseNodeList = (nodes) => {
        const result = {};
        let unnamedCounter = 1;
        
        let i = 0;
        while (i < nodes.length) {
          const node = nodes[i];
          const typeMatch = node.text.match(/^\((.+)\)$/);
          
          if (typeMatch) {
            const type = typeMatch[1];
            let name = '';
            
            if (type === 'array' || type === 'map') {
              if (i > 0 && !nodes[i - 1].text.match(/^\((.+)\)$/)) {
                name = nodes[i - 1].text;
              } else {
                name = `unnamed_${type}_${unnamedCounter++}`;
              }
              
              const childrenNodes = [...(i > 0 ? nodes[i - 1].children : []), ...node.children];
              const parsedChildren = parseNodeList(childrenNodes);
              
              if (type === 'array') {
                const arr = [];
                const keys = Object.keys(parsedChildren).sort((a, b) => Number(a) - Number(b));
                let isNumericKeys = keys.every(k => !isNaN(k));
                if (isNumericKeys && keys.length > 0) {
                  for (let key of keys) {
                    arr.push(parsedChildren[key]);
                  }
                  result[name] = arr;
                } else {
                  result[name] = Object.values(parsedChildren);
                }
              } else {
                result[name] = parsedChildren;
              }
              i++;
            } else {
              let valueStr = '';
              if (i >= 2 && !nodes[i - 2].text.match(/^\((.+)\)$/) && !nodes[i - 1].text.match(/^\((.+)\)$/)) {
                name = nodes[i - 2].text;
                valueStr = nodes[i - 1].text;
              } else if (i === 1 && !nodes[0].text.match(/^\((.+)\)$/)) {
                name = nodes[0].text;
                valueStr = '';
              } else {
                name = `unnamed_field_${unnamedCounter++}`;
                if (i > 0 && !nodes[i - 1].text.match(/^\((.+)\)$/)) {
                  valueStr = nodes[i - 1].text;
                }
              }
              result[name] = parsePrimitive(valueStr, type);
              i++;
            }
          } else {
            i++;
          }
        }
        return result;
      };

      const finalObj = parseNodeList(root.children);
      const cleanObj = {};
      for (let k in finalObj) {
        if (k.trim() !== '') {
          cleanObj[k] = finalObj[k];
        }
      }

      setParsedData(cleanObj);
      setJsonText(JSON.stringify(cleanObj, null, 2));
      setMiddleMode('edit');
      showToast('success', 'Texte de console analysé avec succès !');
    } catch (e) {
      console.error(e);
      showToast('error', `Erreur d'analyse: ${e.message}`);
    }
  };

  // Convert dates/ISO strings to Firestore Timestamps when writing
  const convertToFirestoreTypes = (val) => {
    if (val === null) return null;
    
    if (typeof val === 'string') {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (isoRegex.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return Timestamp.fromDate(d);
        }
      }
      return val;
    }
    
    if (val instanceof Date) {
      return Timestamp.fromDate(val);
    }
    
    if (Array.isArray(val)) {
      return val.map(item => convertToFirestoreTypes(item));
    }
    
    if (typeof val === 'object') {
      if (val.seconds !== undefined && val.nanoseconds !== undefined) {
        return new Timestamp(val.seconds, val.nanoseconds);
      }
      const copy = {};
      for (let k in val) {
        copy[k] = convertToFirestoreTypes(val[k]);
      }
      return copy;
    }
    
    return val;
  };

  // Submit to specified DB
  const handleSaveToDb = async (targetDbInstance, targetDbName, reloadCallback) => {
    let finalPayload = {};
    
    try {
      finalPayload = JSON.parse(jsonText);
    } catch (e) {
      showToast('error', 'JSON invalide dans l\'éditeur. Veuillez corriger la syntaxe.');
      return;
    }

    if (!collectionName.trim()) {
      showToast('error', 'Le nom de la collection est requis.');
      return;
    }

    if (!targetDbInstance) {
      showToast('error', `La base de données ${targetDbName} n'est pas connectée.`);
      return;
    }

    setIsSaving(true);
    showToast('info', `Écriture dans ${targetDbName}...`);

    try {
      const firestorePayload = convertToFirestoreTypes(finalPayload);
      let savedId = '';
      
      if (docId.trim()) {
        const docRef = doc(targetDbInstance, collectionName.trim(), docId.trim());
        await setDoc(docRef, firestorePayload);
        savedId = docId.trim();
      } else {
        const colRef = collection(targetDbInstance, collectionName.trim());
        const docRef = await addDoc(colRef, firestorePayload);
        savedId = docRef.id;
        setDocId(savedId);
      }

      showToast('success', `🎉 Document enregistré avec succès dans ${targetDbName} (ID: ${savedId}) !`);
      if (reloadCallback) reloadCallback();
    } catch (error) {
      console.error(error);
      showToast('error', `Erreur lors de l'enregistrement dans ${targetDbName}: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormatJson = () => {
    try {
      const obj = JSON.parse(jsonText);
      setJsonText(JSON.stringify(obj, null, 2));
      showToast('success', 'JSON formaté avec succès.');
    } catch (e) {
      showToast('error', 'Impossible de formater : le JSON est invalide.');
    }
  };

  // Filters
  const filterList = (list, filterText, typeFilter) => {
    return list.filter(d => {
      // Filter by type if a specific type is selected
      if (typeFilter !== 'all') {
        const docType = d.type || 'unknown';
        if (docType.toLowerCase() !== typeFilter.toLowerCase()) {
          return false;
        }
      }

      const term = filterText.toLowerCase();
      const idMatches = d.id.toLowerCase().includes(term);
      const typeMatches = (d.type || '').toLowerCase().includes(term);
      const brandMatches = (d.brand || '').toLowerCase().includes(term);
      const wordingMatches = (d.calWording || d.pollTxt || d.calName || '').toLowerCase().includes(term);
      return idMatches || typeMatches || brandMatches || wordingMatches;
    });
  };

  // Helper to extract unique types
  const getUniqueTypes = (docs) => {
    const types = new Set();
    docs.forEach(d => {
      if (d.type) {
        types.add(d.type);
      }
    });
    return Array.from(types).sort();
  };

  const prodTypes = getUniqueTypes(prodDocs);
  const testTypes = getUniqueTypes(testDocs);

  const filteredProdDocs = filterList(prodDocs, prodFilter, prodTypeFilter);
  const filteredTestDocs = filterList(testDocs, testFilter, testTypeFilter);

  return (
    <div className="app-container">
      <header>
        <div>
          <h1 className="brand-title">
            <span>⚡</span> Blick Tools Utility Panel
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Gérez vos widgets, listez et copiez des documents d'une base à l'autre en un clic.
          </span>
        </div>

        {/* Global Collection name & Refresh */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', padding: '6px 12px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.7rem', margin: 0 }}>Collection :</label>
            <input
              type="text"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder="Ex: embeds"
              style={{ padding: '6px 10px', fontSize: '0.8rem', width: '120px', background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <button className="btn" onClick={loadBothDbs} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
            🔄 Recharger les BDD
          </button>
        </div>
      </header>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : alert.type === 'error' ? '❌' : 'ℹ️'}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="tabs-nav">
        <button 
          className={`tab-btn ${activeTab === 'transfert' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfert')}
        >
          🔀 Transfert BDD
        </button>
        <button 
          className={`tab-btn ${activeTab === 'refactor' ? 'active' : ''}`}
          onClick={() => setActiveTab('refactor')}
        >
          🛠️ Refactor
        </button>
      </div>

      {activeTab === 'transfert' && (
        <div className="main-grid">
          
          {/* Left Column: Database 1 (Production) */}
          <div className="glass-panel">
            <div className="panel-title">
              <span>🗄️ BDD 1 : Production</span>
              <span className={`status-badge ${prodStatus.status}`}>
                {prodStatus.status === 'connected' ? `🟢 ${prodStatus.message}` : prodStatus.message}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Filtrer..."
                  value={prodFilter}
                  onChange={(e) => setProdFilter(e.target.value)}
                  style={{ padding: '8px', fontSize: '0.8rem', flex: 1 }}
                />
                <select
                  className="panel-select"
                  value={prodTypeFilter}
                  onChange={(e) => setProdTypeFilter(e.target.value)}
                  style={{ maxWidth: '140px' }}
                >
                  <option value="all">Tous les types</option>
                  {prodTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="doc-list-scroll">
                {prodStatus.status === 'loading' ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>Chargement...</div>
                ) : filteredProdDocs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>Aucun document.</div>
                ) : (
                  filteredProdDocs.map((docItem) => (
                    <div className="doc-card" key={docItem.id}>
                      <div className="doc-card-header">
                        <div className="doc-id-text">{docItem.id}</div>
                        <div className="doc-meta-tags">
                          <span className="meta-tag type">{docItem.type || 'unknown'}</span>
                          <span className="meta-tag brand">{docItem.brand || 'blick'}</span>
                        </div>
                      </div>
                      <div className="doc-card-body">
                        {docItem.calWording || docItem.pollTxt || docItem.calName || ''}
                      </div>
                      <div className="doc-card-actions">
                        <button className="btn btn-secondary" onClick={() => handleLoadToEditor(docItem)}>
                          Inspecter 🔍
                        </button>
                        <button className="btn btn-success" disabled={isCloning} onClick={() => handleCloneLeftToRight(docItem)}>
                          Copier vers BDD 2 ➡️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Middle Column: Selected Document JSON Editor */}
          <div className="glass-panel" style={{ border: '1px solid rgba(59, 130, 246, 0.25)' }}>
            <div className="panel-title" style={{ borderColor: 'rgba(59, 130, 246, 0.15)' }}>
              <span>📝 Éditeur du document</span>
              
              {/* Editor sub-tabs */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '2px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', border: 'none', background: middleMode === 'edit' ? 'rgba(255,255,255,0.08)' : 'transparent', boxShadow: 'none' }}
                  onClick={() => setMiddleMode('edit')}
                >
                  Éditeur JSON
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', border: 'none', background: middleMode === 'parse' ? 'rgba(255,255,255,0.08)' : 'transparent', boxShadow: 'none' }}
                  onClick={() => setMiddleMode('parse')}
                >
                  Parser Texte Console
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '12px' }}>
              
              {/* Target ID setting */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>ID du document sélectionné</label>
                <input
                  type="text"
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  placeholder="Auto-généré si vide"
                  style={{ padding: '8px', fontSize: '0.85rem' }}
                />
              </div>

              {middleMode === 'edit' ? (
                <>
                  <textarea
                    className="json-editor"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    placeholder="{}"
                  />
                  
                  {/* Editor Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button className="btn btn-secondary" onClick={handleFormatJson} style={{ flex: 1 }}>
                      Format JSON 🧹
                    </button>
                    <button
                      className="btn btn-error"
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                      onClick={() => {
                        setJsonText('{}');
                        setDocId('');
                        showToast('info', 'Éditeur vidé.');
                      }}
                    >
                      Vider 🗑️
                    </button>
                  </div>

                  {/* Save target triggers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px', flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary"
                      disabled={isSaving || !isProdAvailable}
                      onClick={() => handleSaveToDb(prodDb, 'BDD 1 (Prod)', fetchProdDocs)}
                      style={{ borderColor: 'rgba(96, 165, 250, 0.3)' }}
                    >
                      💾 Enregistrer dans BDD 1
                    </button>
                    <button
                      className="btn btn-success"
                      disabled={isSaving}
                      onClick={() => handleSaveToDb(db, 'BDD 2 (Test)', fetchTestDocs)}
                    >
                      💾 Enregistrer dans BDD 2
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="raw-parser-area">Coller le texte de structure brute</label>
                    <textarea
                      id="raw-parser-area"
                      className="json-editor"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={`Exemple :\nbrand\n"blick"\n(string)\n\ncounterViews\n11393\n(int64)`}
                      style={{ flex: 1 }}
                    />
                  </div>

                  <button className="btn btn-success" onClick={handleParse} style={{ width: '100%' }}>
                    Analyser & Charger dans l'Éditeur 🔮
                  </button>
                </>
              )}

            </div>
          </div>

          {/* Right Column: Database 2 (Test) */}
          <div className="glass-panel">
            <div className="panel-title">
              <span>🗄️ BDD 2 : Test</span>
              <span className={`status-badge ${testStatus.status}`}>
                {testStatus.status === 'connected' ? `🟢 ${testStatus.message}` : testStatus.message}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Filtrer..."
                  value={testFilter}
                  onChange={(e) => setTestFilter(e.target.value)}
                  style={{ padding: '8px', fontSize: '0.8rem', flex: 1 }}
                />
                <select
                  className="panel-select"
                  value={testTypeFilter}
                  onChange={(e) => setTestTypeFilter(e.target.value)}
                  style={{ maxWidth: '140px' }}
                >
                  <option value="all">Tous les types</option>
                  {testTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="doc-list-scroll">
                {testStatus.status === 'loading' ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>Chargement...</div>
                ) : filteredTestDocs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>Aucun document.</div>
                ) : (
                  filteredTestDocs.map((docItem) => (
                    <div className="doc-card" key={docItem.id}>
                      <div className="doc-card-header">
                        <div className="doc-id-text">{docItem.id}</div>
                        <div className="doc-meta-tags">
                          <span className="meta-tag type">{docItem.type || 'unknown'}</span>
                          <span className="meta-tag brand">{docItem.brand || 'blick'}</span>
                        </div>
                      </div>
                      <div className="doc-card-body">
                        {docItem.calWording || docItem.pollTxt || docItem.calName || ''}
                      </div>
                      <div className="doc-card-actions">
                        <button className="btn btn-secondary" onClick={() => handleLoadToEditor(docItem)}>
                          Inspecter 🔍
                        </button>
                        <button className="btn btn-success" disabled={isCloning} onClick={() => handleCloneRightToLeft(docItem)}>
                          ⬅️ Copier vers BDD 1
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'refactor' && (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-main)' }}>Outil de Refactoring</h2>
            <p>Cet espace est prêt pour accueillir la logique de modification en masse !</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
