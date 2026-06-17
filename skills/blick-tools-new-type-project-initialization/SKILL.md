----------
name: blick-tools-new-type-project-initialization
description: This skill governs the adaptation of a "template" or "cloned" project into a new specific widget type.
----------

## 1. ARCHITECTURE LOGIC
- This skill governs the adaptation of a "template" or "cloned" project into a new specific widget type. The user needs do define the new type of widget. Do not proceed if user omits giving the new type of widget.
- The term **XXXX** must systematically be replaced by the target content type (e.g., `potm`, `calendar`, `survey`).
- The goal is to ensure a clean, secure codebase that is correctly connected to Firebase from the start.

## 2. ENVIRONMENT CONFIGURATION
- **.env file**: Create a `.env` file at the root. Retrieve the following Firestore API keys from the [secrets.md](file:///Users/gre/Documents/IA-Workflows/blick%20tools/secrets.md) file:
    - `VITE_FIREBASE_API_KEY`
    - `VITE_FIREBASE_AUTH_DOMAIN`
    - `VITE_FIREBASE_PROJECT_ID`
    - `VITE_FIREBASE_STORAGE_BUCKET`
    - `VITE_FIREBASE_MESSAGING_SENDER_ID`
    - `VITE_FIREBASE_APP_ID`
    - `VITE_FIREBASE_MEASUREMENT_ID`
- **.gitignore file**: Create or verify the `.gitignore` file. It must strictly exclude:
    - `node_modules`
    - `.env`
    - `blick tools/secrets.md` (Crucial: contains the API keys)

## 3. HTML IDENTIFICATION (index.html)
- **Title tag**: Update the content to `<title>Blick Tools XXXX app</title>` (replace XXXX with the current content type).

## 4. APP.JSX REFACTORING
- **4.a - Update State**: `const [XXXX, setXXXX] = useState(null);`
- **4.b - Render Cleanup**: The `return` statement should only return `div.App` (keep existing classes/ids) containing only the `<LoadingOverlay show={XXXX === null} />` component.
- **4.c - Analytics Logic**: 
    - In the `async incrementViewCounter(docId)` function, the Firestore reference inside the `try` block must use the `embeds` collection: `const XXXXRef = doc(db, 'embeds', docId);`
    - Comment out the calls to `incrementViewCounter` and `dataLayerPushView` inside `useEffect` (or the loading function) as we don't want to trigger them before the first build.
- **4.d - Lifecycle (useEffect)**: 
    - `urlParams` must look for the value of the `XXXXDoc` parameter.
    - Rename the loading function to `loadXXXX()`.
    - Inside `loadXXXX`, fetch the data and set the `XXXX` state.
    - Ensure console logs use the local `data` variable for verification (e.g., `console.log('XXXX data:', data);`) to avoid async state lag display issues.
- **4.e - Imports**: Rename the service import at the top of the file: `import { fetchXXXXData } from './services/api';`.
- **4.f - État devMode** : S'assurer qu'un état `devMode` (boolean, initialisé à `false`) existe dans `App.jsx`. Si absent, le définir.

## 5. API SERVICE UPDATE (api.js)
- **Fetch Function**: Rename the function to `fetchXXXXData(docRef)`.
- **Logic**: Use the `embeds` collection for the Firestore reference: `const XXXXRef = doc(db, 'embeds', docRef);`
- **Error Handling**: Update the error message to explicitly mention the specific widget type.

## 6. LOADING OVERLAY COMPONENT
- **Prop visibility**: Ensure the `LoadingOverlay` component in `src/components/LoadingOverlay/LoadingOverlay.jsx` accepts a `show` prop and renders `null` if `show` is false.

## 7. VERIFICATION
- To be sure that the new type of widget is correctly connected to Firebase from the start, `console.log` the `docId` content and the fetched `data`. If either is null or undefined, it means that the new type of widget is not correctly connected to Firebase from the start.