# Feature Specification: API de création de sondages pour le Hub Rédaction

**Feature Branch**: `001-poll-create-api`

**Created**: 2026-11-09

**Status**: Implemented (non déployé)

**Input**: User description: "Exposer une API pour créer un sondage Blick Tools depuis un autre
service, le backend Hub Rédaction (Cloud Run), en appel de serveur à serveur. On commence par un
contrat POST /polls : en entrée la question, les réponses, la marque et la rubrique ; en sortie
{ id, embedUrl }, avec l'authentification et les erreurs. La logique de création
(transformWidgetData et la validation dans apps/backend/src/components/Form/Form.jsx) doit être
sortie dans un module partagé pour que l'admin et l'API produisent les mêmes documents. Le widget
poll sert de cobaye."

## Clarifications

### Session 2026-11-09

- Q: Comment le Hub Rédaction s'authentifie-t-il ? → A: Jeton d'identité OIDC émis par Google
  pour le compte de service du Hub ; l'API vérifie signature, audience et appartenance de
  l'appelant à une liste blanche. Aucun secret partagé.
- Q: Où tourne l'API ? → A: Un service dans le projet Google Cloud de Blick Tools, un
  déploiement par environnement (test, production).
- Q: Que vaut l'auteur d'un sondage créé par l'API ? → A: E-mail du journaliste, optionnel ;
  à défaut le libellé fixe « Hub Rédaction ».
- Q: Gère-t-on le rejeu d'un appel en échec réseau ? → A: Oui, via une clé d'idempotence
  optionnelle fournie par l'appelant.
- Q: Périmètre de l'extraction partagée ? → A: Le type `poll` sert de cobaye : sa validation et
  la transformation en document 4 blocs sont partagées ; les autres types gardent leur
  validation dans le dashboard pour l'instant.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Créer un sondage depuis le Hub (Priority: P1)

Un journaliste prépare un article dans le Hub Rédaction et y saisit une question de sondage,
ses réponses, la marque et la rubrique. Le Hub transmet ces informations à Blick Tools et reçoit
l'identifiant du sondage et l'URL d'embed, qu'il insère dans l'article. Le sondage fonctionne
exactement comme s'il avait été créé dans le dashboard : il apparaît dans la liste, se vote, ses
votes sont comptés et remontent dans les rapports.

**Why this priority**: c'est toute la valeur de la fonctionnalité ; sans elle le journaliste
quitte son outil pour passer par le dashboard.

**Independent Test**: envoyer une demande valide authentifiée ; ouvrir l'URL d'embed renvoyée :
le sondage s'affiche avec la question et les réponses, un vote est compté ; le sondage figure
dans la liste du dashboard avec la bonne marque, rubrique et auteur.

**Acceptance Scenarios**:

1. **Given** un appelant autorisé, **When** il envoie une question, deux réponses ou plus, une
   marque et une rubrique valides, **Then** un sondage est créé et la réponse contient son
   identifiant et son URL d'embed.
2. **Given** un sondage créé par l'API, **When** on l'ouvre dans le dashboard, **Then** il est
   éditable sans erreur et le document stocké a la même forme qu'un sondage créé dans le
   dashboard avec les mêmes saisies.
3. **Given** une demande sans marque, **When** elle est acceptée, **Then** la marque vaut
   `blick`.
4. **Given** une demande avec l'e-mail du journaliste, **When** elle est acceptée, **Then** cet
   e-mail est l'auteur affiché dans le dashboard ; sans e-mail, l'auteur affiché est
   « Hub Rédaction ».
5. **Given** une demande pour la marque `pme`, **When** elle est acceptée, **Then** l'URL d'embed
   active l'intégration PME, comme le lien copié depuis le dashboard.

---

### User Story 2 - Refus explicites et exploitables (Priority: P1)

Quand la demande est invalide ou non autorisée, le Hub reçoit un refus qui dit quoi corriger,
champ par champ, sans qu'aucun sondage ne soit créé.

**Why this priority**: un service appelant sans retour exploitable crée des sondages incomplets
ou réessaie à l'aveugle ; la sécurité de l'écriture en production en dépend.

**Independent Test**: envoyer successivement une demande sans identité, avec une identité non
autorisée, avec des champs invalides : chaque réponse a un statut et un code distincts, la liste
des champs fautifs, et aucun document n'est écrit.

**Acceptance Scenarios**:

1. **Given** une demande sans preuve d'identité ou avec une preuve invalide/expirée, **When**
   elle arrive, **Then** elle est refusée comme non authentifiée.
2. **Given** une identité valide mais absente de la liste blanche, **When** elle arrive,
   **Then** elle est refusée comme non autorisée.
3. **Given** une rubrique absente, une question vide, moins de deux réponses ou une réponse vide,
   **When** la demande arrive, **Then** elle est refusée avec la liste de tous les champs fautifs
   et la règle enfreinte pour chacun.
4. **Given** un corps illisible, d'un type non pris en charge ou trop volumineux, **When** il
   arrive, **Then** il est refusé avec un code dédié.
5. **Given** un champ inconnu dans la demande, **When** elle arrive, **Then** elle est refusée
   (protège contre les fautes de frappe silencieuses).

---

### User Story 3 - Rejouer sans doublon (Priority: P2)

Le Hub n'a pas reçu la réponse (coupure, délai dépassé). Il renvoie la même demande avec la même
clé d'idempotence et obtient le sondage déjà créé, pas un second.

**Why this priority**: évite les doublons dans le dashboard et dans les articles ; utile mais la
création simple (P1) a de la valeur sans elle.

**Independent Test**: envoyer deux fois la même demande avec la même clé : même identifiant et
même URL, un seul document. Renvoyer la clé avec une question différente : refus pour conflit.

**Acceptance Scenarios**:

1. **Given** une demande acceptée avec la clé K, **When** la même demande est rejouée avec K,
   **Then** la réponse renvoie le même identifiant et la même URL, signale qu'il s'agit d'un
   rejeu, et aucun document n'est créé.
2. **Given** une demande acceptée avec la clé K, **When** une demande différente arrive avec K,
   **Then** elle est refusée pour conflit d'idempotence.
3. **Given** deux appelants autorisés distincts, **When** ils utilisent la même clé K, **Then**
   leurs sondages sont distincts (la clé est propre à chaque appelant).
4. **Given** une demande sans clé, **When** elle est rejouée, **Then** deux sondages sont créés
   (comportement documenté).

---

### User Story 4 - Le dashboard produit les mêmes documents (Priority: P1)

La création et l'édition d'un sondage dans le dashboard reposent désormais sur les mêmes règles
de validation et la même transformation que l'API. Les éditeurs ne voient aucun changement, sauf
qu'une question composée uniquement d'espaces est désormais refusée.

**Why this priority**: c'est la garantie « mêmes documents » demandée ; une régression du
dashboard toucherait tous les types de widgets.

**Independent Test**: créer puis éditer un sondage dans le dashboard ; créer puis éditer un
widget d'un autre type ; comparer les documents avant/après extraction : forme identique.

**Acceptance Scenarios**:

1. **Given** le dashboard, **When** un éditeur crée un sondage, **Then** les messages et
   surlignages d'erreur sont les mêmes qu'avant pour chaque règle.
2. **Given** un sondage existant ayant reçu des votes, **When** il est édité dans le dashboard,
   **Then** ses compteurs sont préservés.
3. **Given** un widget d'un autre type, **When** il est créé ou édité, **Then** le document
   produit est identique à celui produit avant l'extraction.
4. **Given** un sondage, **When** on copie son lien depuis le dashboard, **Then** l'URL est
   identique à celle que l'API renverrait pour le même sondage.

### Edge Cases

- Réponses avec espaces autour : le texte est rogné ; réponse réduite à des espaces : refusée.
- Question réduite à des espaces : refusée (dashboard et API).
- Marque ou rubrique hors des valeurs autorisées (casse comprise : `sport` ≠ `Sport`) : refusées.
- Plus de 10 réponses : acceptées (la production compte des sondages à 14 réponses).
- E-mail auteur mal formé : refusé.
- Indisponibilité du stockage : refus signalé comme temporaire, rejouable sans risque si une clé
  d'idempotence est fournie.
- Rejeu avec clé alors que le sondage a été modifié ou supprimé dans le dashboard depuis : la
  comparaison se fait sur le contenu stocké ; s'il a changé, conflit.
- Méthode ou chemin non pris en charge : refus explicite, aucun effet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST accepter une demande de création de sondage contenant une
  question, une liste de réponses, une rubrique, et optionnellement une marque et l'e-mail de
  l'auteur.
- **FR-002**: Le système MUST n'accepter que les appelants prouvant une identité de service
  Google valide, émise pour l'audience de ce service, et présente dans une liste blanche
  configurée par environnement.
- **FR-003**: Le système MUST valider la demande avec les mêmes règles que le dashboard : rubrique
  ∈ {Suisse, Inter, Sport} obligatoire ; marque ∈ {blick, pme}, défaut `blick` ; question non
  vide après rognage ; au moins deux réponses, chacune non vide après rognage.
- **FR-004**: Le système MUST renvoyer toutes les violations de validation en une seule réponse,
  chacune avec le champ concerné, un code stable et un message lisible.
- **FR-005**: Le système MUST, en cas de succès, renvoyer l'identifiant du sondage et son URL
  d'embed pour l'environnement qui l'a créé.
- **FR-006**: Le système MUST produire un document au modèle 4 blocs identique, champ pour champ,
  à celui que produit le dashboard pour les mêmes saisies (hors auteur, horodatages et
  identifiants générés), avec un identifiant unique par réponse et un compteur à zéro par
  réponse.
- **FR-007**: Le système MUST écrire le document en une seule opération : il n'existe jamais de
  sondage partiellement créé visible des lecteurs.
- **FR-008**: Le système MUST, lorsqu'une clé d'idempotence est fournie, garantir au plus un
  sondage par couple (appelant, clé), renvoyer le sondage existant pour une demande identique et
  refuser une demande différente.
- **FR-009**: Le système MUST refuser sans effet les corps non JSON, d'un type de contenu non
  pris en charge, de plus de 64 Kio, ou contenant des champs inconnus.
- **FR-010**: Le système MUST distinguer dans ses refus : non authentifié, non autorisé, demande
  invalide, conflit d'idempotence, trop volumineux, type non pris en charge, ressource ou
  méthode inconnue, indisponibilité temporaire, erreur interne.
- **FR-011**: Le système MUST journaliser chaque création et chaque refus avec l'appelant,
  l'identifiant créé le cas échéant et le code de refus, sans journaliser le jeton.
- **FR-012**: Le dashboard MUST utiliser la même validation et la même transformation que l'API
  pour les sondages, et la même transformation pour tous les autres types.
- **FR-013**: Le dashboard MUST construire le lien copié d'un widget avec la même règle que
  l'URL d'embed renvoyée par l'API.
- **FR-014**: Le système MUST refuser de démarrer si sa configuration (audience, liste blanche,
  base des URL d'embed) est absente ou invalide.

### Key Entities

- **Demande de création** : question, réponses (textes ordonnés), rubrique, marque, e-mail
  auteur ; clé d'idempotence optionnelle portée hors du corps.
- **Sondage (widget `poll`)** : document 4 blocs — `meta` (id, marque, rubrique, auteur,
  supprimé, horodatages, titre), `data` (question, réponses avec id), `stats` (vues, compteurs
  par id de réponse).
- **Appelant** : identité de compte de service Google autorisée par la liste blanche.
- **Résultat** : identifiant du sondage + URL d'embed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un sondage créé par l'API s'affiche, se vote et apparaît dans le dashboard sans
  aucune intervention manuelle, dans 100 % des créations réussies.
- **SC-002**: Pour un même jeu de saisies, le document produit par l'API et celui produit par le
  dashboard sont identiques hors auteur, horodatages et identifiants générés.
- **SC-003**: 100 % des demandes non authentifiées ou non autorisées sont refusées sans écriture.
- **SC-004**: Rejouer une demande avec la même clé d'idempotence ne crée jamais de second sondage.
- **SC-005**: Une demande valide reçoit sa réponse en moins de 2 secondes au 95e centile hors
  démarrage à froid.
- **SC-006**: Aucun changement visible pour les éditeurs du dashboard, hors refus d'une question
  composée uniquement d'espaces.

## Assumptions

- Le Hub Rédaction tourne sur Google Cloud avec un compte de service dédié et sait obtenir un
  jeton d'identité pour une audience donnée.
- Les valeurs autorisées de rubrique et marque sont celles du dashboard actuel (relevé
  production du 2026-11-09 : rubriques non vides ⊂ {Suisse, Inter, Sport}, marques non vides
  ⊂ {blick, pme}).
- Pas de limite haute du nombre de réponses ni de la longueur des textes au-delà de la limite
  de taille du corps (le dashboard n'en impose pas).
- Hors périmètre : lecture, modification, suppression de sondages par l'API ; autres types de
  widgets ; extraction de la validation des autres types.
- Le sondage créé n'est pas « publié » à part : il est vivant dès sa création, comme dans le
  dashboard.
- Les règles de sécurité Firestore ne changent pas : l'API écrit avec un compte de service, borné
  par son rôle IAM.
