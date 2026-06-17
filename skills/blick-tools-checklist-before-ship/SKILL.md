----------
name: blick-tools-checklist-before-ship
description: This skill is used to make the app ready to be checked. It includes a list of requirements that need to be filled to make the app valid.
----------

## 1. LOGIQUE D'ARCHITECTURE 
- Ce skill est une check-list de validation finale obligatoire avant toute livraison d'un produit Blick Tools.
- L'agent doit scanner le code pour identifier les écarts et produire un rapport détaillé.
- **Règle d'or** : Ne jamais modifier de code sans un accord explicite après la lecture du rapport.
- The term **XXXX** must systematically be replaced by the target content type (e.g., `potm`, `calendar`, `survey`). The type must be given by user. Do not continue if type isn't given.

## 2. ANALYTICS & TRACKING (analytics.js)
- **Compteur de vues** : La fonction `incrementCounterViews(docId)` doit être présente dans le `useEffect` de `App.jsx` (non commentée).
- **Gtag Manager** : La fonction `dataLayerPushView(docId)` doit être appelée simultanément.
- **Cas spécifique XXXX** : 
    - Paramètre : La fonction reçoit l'objet `XXXXDoc`.
    - Iframe ID : Doit être construit ainsi : ``const iframeId = `storytelling_XXXX_${docId}`;``
    - Payload : L'événement `iframe_impression` doit être poussé dans `window.blickDataLayer`.

## 3. UI & ÉTATS DE CHARGEMENT
- **LoadingOverlay** : Vérifier la présence de `<LoadingOverlay show={data === null} />` (où `data` est le type de document sujet de l'app).
- **Console Logs** : S'assurer que tous les `console.log` sont commentés ou retirés.
- **DevMode** : Vérifier que le state `devMode` est impérativement sur `false`.

## 4. LOGIQUE DE VOTE & PERSISTANCE
- **Vérification** : Si les variables contiennent "votes" ou "Votes", vérifier la présence d'un contrôle de vote unique via `localStorage` ou cookie.
- **Contexte** : Préciser dans le rapport si le vote multiple est autorisé ou non selon la configuration actuelle.

## 5. CONFIGURATION HTML (index.html)
- **SEO Title** : Le format doit être `<title>Blick Tools [type] app</title>` (ex: `Blick Tools XXXX app`).
- **Global CSS** : L'appel `<link rel="stylesheet" href="https://utils.blick.ch/static/global/css/base.css" />` est obligatoire.
- **Prevent Indexing** : Vérifier que le meta `robots` est bien défini sur `noindex`.

## 6. DARKMODE & AUDIT CSS
- **Styles Globaux** : Vérifier l'utilisation des polices `BlickVariable` et `InterVariable`.
- **Variables Dynamiques** : S'assurer que les couleurs utilisent les variables réactives (ex: `var(--color-text-default)`, `var(--color-fill-brand)`).
- **Nettoyage CSS** : Lister les sélecteurs CSS/SCSS inutilisés (ciblant des éléments absents du DOM).
 
## 7. VÉRIFICATION .GITIGNORE
- **Règle** : Vérifier que les éléments suivants ne sont jamais indexés/commités dans Git :
    - `skills/`
    - `.env`
    - `.env.*`

## 8. FORMAT DU RAPPORT DE SORTIE
L'agent doit retourner un rapport structuré par sections :
1. **Analytics** : [Statut OK/KO]
2. **Configuration HTML** : [Statut OK/KO]
3. **Audit Darkmode & CSS** : [Détails]
4. **Logic & Cleanup** : [Vérification logs, devMode et votes]
5. **.gitignore** : [Statut OK/KO]
6. **robots.txt** : Rappeler à l'utilisateur de vérifier que le fichier robots.txt est bien configuré.