# SKILL: MULTI-BRAND-COMPONENT-GENERATOR

## 1. LOGIQUE D'ARCHITECTURE
- Les composants ne doivent PAS avoir de container racine avec la classe brand.
- La classe `.brand-blick` ou `.brand-pme` est appliquée globalement (ex: sur le <body> ou un parent lointain).
- Le composant doit être le plus "plat" possible.

## 2. RÈGLES DE GÉNÉRATION CSS
Générer systématiquement trois sections dans le bloc de style :
1. BASE : Layout neutre (Flex, Spacing, Transitions).
2. BLICK : Sélecteurs préfixés par `.brand-blick`.
3. PME : Sélecteurs préfixés par `.brand-pme`.

## 3. RÉFÉRENTIEL MARQUE : BLICK
- Sélecteur Parent : .brand-blick
- Couleurs : Utiliser exclusivement les variables CSS natives (ex: var(--color-fill-brand)).
- Typo Titre : font-family: 'BlickVariable'; font-weight: 900;
- Typo Corps : font-family: 'InterVariable';
- Boutons : border-radius: 9999px; transition: 0.2s ease-in-out;
- Style visuel : Moderne, News, bords arrondis.
- **Bouton Primaire** : 
    - Forme : `border-radius: 9999px; border: none;`
    - Padding : `12px 24px;`
    - Texte : `font-family: 'InterVariable'; font-weight: 700; font-size: 16px;`
    - Couleurs : `background: var(--color-fill-brand); color: var(--color-text-inverse);`

## 4. RÉFÉRENTIEL MARQUE : PME
- Sélecteur Parent : .brand-pme
- Couleurs Primaires : Cyan (#00D1FF), Pink (#E6005C).
- Background : #0A0A0A; Color: #FFFFFF;
- Typo Titre : font-family: serif; font-weight: bold;
- Typo Corps : font-family: sans-serif;
- Boutons : border-radius: 0px; text-transform: uppercase; letter-spacing: 0.05em; background: #00D1FF; color: black;
- Accents : Ajouter une bordure haute (border-top: 3px solid #E6005C) sur les headers ou sections.
- Style visuel : Business, Magazine, bords carrés, majuscules.

## 5. EXEMPLE DE SORTIE ATTENDUE
Toujours privilégier ce format de sélecteur :
.brand-pme .my-button { ... }
.brand-blick .my-button { ... }

## 6. STRUCTURE DES FICHIERS ET CONVENTIONS
- Emplacement : Chaque composant doit être généré dans `src/components/[NOM_DU_COMPOSANT]/`.
- Fichiers requis :
    1. `[NOM_DU_COMPOSANT].jsx`
    2. `style.module.css`

## 7. RÉDACTION DES CSS MODULES (MULTI-BRAND)
- Utiliser `:global(.brand-X)` devant le sélecteur de classe locale.
- Format type dans style.module.css :
    .button { /* Styles de base / layout */ }
    
    :global(.brand-blick) .button {
       background: var(--color-fill-brand);
    }
    
    :global(.brand-pme) .button {
       background: #00D1FF;
    }

## 8. COMPOSANTS TÉMOINS (MODÈLES DE RÉFÉRENCE)
Cette section sert de moule technique. L'agent doit reproduire la structure et les proportions de ces exemples pour tout nouveau composant de même type.

### A. TYPE : BUTTON (Bouton Primaire BLICK et PME)
- **Structure CSS de référence :**
    ```css
    .button {
      font-size: 1rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
    }

    .disabled {
      cursor: not-allowed;
      pointer-events: none;
      opacity: 0.5;
    }

      /* Styles pour la marque BLICK */
      :global(.brand-blick) .button {
      border-radius: 9999px;
      background: var(--color-fill-brand);
      color: white;
      font-family: 'InterVariable', sans-serif;
      font-weight: 700;
      padding: 0 1.5rem;
      height: 48px;
    }

    :global(.brand-blick) .button:hover {
      background: var(--color-fill-brand_hover);
    }

    /* Styles pour la marque PME */
    :global(.brand-pme) .button {
      border-radius: 0px;
      background: #00D1FF;
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 800;
      padding: 12px 24px;
    }

    :global(.brand-pme) .disabled {
      background: #333333;
      color: #666666;
      border-color: #444444;
    }
    ```

### B. TYPE : TITLE (Titre Primaire BLICK et PME)
- **Structure CSS de référence :**
    ```css
    .title {
      margin: 0;
      padding: 0;
      line-height: 1;
      display: block;
    }

    /* BRAND: BLICK */
    :global(.brand-blick) .title {
      font-family: 'BlickVariable', sans-serif;
      font-weight: 700;
      text-transform: none;
    }

    :global(.brand-blick) h1.title { font-size: 3rem; }
    :global(.brand-blick) h2.title { font-size: 2.25rem; }
    :global(.brand-blick) h3.title { font-size: 1.75rem; }

    /* BRAND: PME */
    :global(.brand-pme) .title {
      font-family: serif;
      font-weight: bold;
      text-transform: uppercase;
      border-top: 3px solid #E6005C;
      display: block;
      padding-top: 0.25rem;
    }

    :global(.brand-pme) h1.title { font-size: 2.5rem; letter-spacing: -0.02em; }
    :global(.brand-pme) h2.title { font-size: 1.875rem; }
    :global(.brand-pme) h3.title { font-size: 1.25rem; }
    ```
