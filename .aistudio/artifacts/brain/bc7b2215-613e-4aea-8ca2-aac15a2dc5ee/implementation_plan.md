# Refonte des Routines, Répertoire d’Activités, Suppression du Tag/Catégorie Routine & Hiérarchie d’Importance

Ce plan révisé applique exactement vos précisions : noms stricts des quatre niveaux d’importance (**Facultatif**, **Unique**, **Irréductible**, **Important**) réglables uniquement dans **Création**, répertoire d’activités épuré avec recherche et menu déroulant par activité, suppression complète de « Routine » comme tag et comme catégorie, et gestion de la **Routine** réduite à un menu déroulant simple dans **Paramètres** pour choisir les activités et leurs horaires.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Ajustements intégrés suite à vos remarques :**
> - **Noms exacts et portée des niveaux d’importance** :
>   - **Niveau 4 — `Facultatif`** : peut être décalé, réduit ou supprimé en cas de conflit avec une activité de même importance ou plus importante.
>   - **Niveau 3 — `Irréductible`** : peut être déplacé mais jamais supprimé (ni réduit) en cas de conflit avec une activité de même importance ou plus importante.
>   - **Niveau 2 — `Unique`** *(attribué automatiquement par défaut)* : peut seulement être réduit ou supprimé en cas de conflit avec une activité de même importance ou plus importante, avec confirmation de l’utilisateur.
>   - **Niveau 1 — `Important`** : ne peut être ni déplacé ni supprimé en cas de conflit ; si deux activités `Important` entrent en conflit, l’utilisateur est notifié pour choisir de les faire **coexister** ou d’en modifier une lui-même.
>   - **Niveau 0 — Autorité utilisateur** : toute modification manuelle directe d’une activité existante par l’utilisateur est absolue.
> - **Réglage d’importance exclusif au volet Création** : Le choix du niveau d’importance n’apparaît **que** dans le volet **Création** (pour chaque activité du répertoire). Toute activité ajoutée ponctuellement depuis le calendrier sans profil reçoit automatiquement le niveau **2 — Unique**.
> - **Répertoire d’activités dans Création** : Liste compacte permettant de chercher et repérer une activité d’un coup d’œil (barre de recherche + ligne synthétique), avec toutes ses caractéristiques (importance, tag, durée, règles, objectif) rangées dans un **menu déroulant** individuel afin de ne pas surcharger la page.
> - **Suppression totale de « Routine » en tant que tag et catégorie** : « Routine » disparaît à la fois des tags et des catégories d’événements.
> - **Routine en menu déroulant dans Paramètres** : Un menu déroulant dans **Paramètres** permet simplement de sélectionner les activités à inclure et leurs horaires (heure et jours), sans écran supplémentaire.

---

## 1. Overview & Core Concept

- **Activité** : Terme unique utilisé dans toute l’application (planning, création, modale, confirmation). Une activité peut être créée ponctuellement sur le calendrier (niveau `Unique` par défaut) ou enregistrée dans le répertoire du volet **Création**.
- **Tags** : Purs regroupements thématiques destinés uniquement au volet **Suivi** (camembert et courbes), sans aucun effet sur la planification.
- **Routine (dans Paramètres)** : Un programme global unique, accessible via un menu déroulant dans **Paramètres**, où l’utilisateur sélectionne des activités et leurs horaires pour qu’elles soient répétées à chaque génération de planning, avec bouton **Générer** et bouton **Revenir en arrière**.

---

## 2. User Experience & Visual Design

### A. Volet Création — Répertoire compact & Menu déroulant de caractéristiques

- **Sous-vues conservées** : Deux onglets uniquement (**Activités** et **Tags & Objectifs**).
- **Onglet Activités (Répertoire scannable)** :
  - **Barre supérieure** : Champ de recherche instantanée (« Rechercher une activité… ») et bouton/formulaire compact pour ajouter une nouvelle activité.
  - **Lignes du répertoire (d’un coup d’œil)** : Chaque activité occupe une ligne sobre et peu haute affichant uniquement l’essentiel : pastille de couleur du tag, nom de l’activité, niveau d’importance (`Facultatif` / `Unique` / `Irréductible` / `Important`), durée, et bouton d’ouverture du **menu déroulant** des caractéristiques + bouton rapide `Planifier`.
  - **Menu déroulant des caractéristiques (replié par défaut)** : En cliquant sur une activité (ou son chevron), le panneau se déplie pour régler :
    1. **Niveau d’importance** (`Facultatif`, `Unique`, `Irréductible`, `Important`) — *seul endroit de l’app où ce réglage existe* ;
    2. **Tag de suivi** (thème purement graphique pour le volet Suivi) et **Catégorie visuelle** ;
    3. **Durée par défaut** ;
    4. **Règles de conflit** (décalage, réduction, durée min, marge) ;
    5. **Objectif facultatif de suivi** (min/max par jour ou semaine).
- **Onglet Tags & Objectifs** :
  - Contient uniquement les tags thématiques (`Sommeil`, `Travail profond`, `Travail & RDV`, `Sport & Santé`, `Personnel` et tags créés par l’utilisateur). Aucun tag « Routine ».

### B. Volet Paramètres — Menu déroulant Routine

- Dans la section **03. Routine quotidienne**, tout tient dans un **menu déroulant** simple et léger :
  - Un bouton/en-tête déroulant résume le nombre d’activités sélectionnées dans la routine (ex. : `4 activités configurées · Déplier`).
  - Une fois déplié, l’utilisateur retrouve la liste des entrées de sa routine : pour chacune, il **sélectionne une activité** dans une liste déroulante issue du répertoire de Création, définit **l’horaire** (heure de début et durée, ou jours actifs), ou ajoute/supprime une ligne. C’est tout.
- La section **05. Génération du planning** conserve la durée en semaines, la date de départ, le bouton **Générer le planning** (qui répète la routine sélectionnée + sommeil) et le bouton **Revenir en arrière**.

### C. Volet Planning — Saisie épurée & Confirmation dès le niveau Irréductible (3)

- **Modale d’ajout / modification sur le calendrier** :
  - **Aucun sélecteur d’importance** n’est affiché dans cette modale.
  - L’utilisateur peut saisir librement le titre, la date, l’horaire et un tag optionnel, **ou** pré-remplir depuis une activité du répertoire (qui transmet alors son niveau d’importance).
  - En saisie libre sans profil, l’activité reçoit automatiquement le niveau **2 — Unique**.
- **Confirmation obligatoire de réarrangement** :
  - Si un ajout ou un changement affecte au moins une activité de niveau **3 (`Irréductible`)**, **2 (`Unique`)** ou **1 (`Important`)**, une vue de confirmation détaille précisément l’action prévue (déplacement pour `Irréductible`, réduction/suppression pour `Unique`), avec les boutons **Confirmer**, **Modifier l’horaire** ou **Annuler l’ajout**.
  - Si deux activités de niveau **1 (`Important`)** entrent en conflit, une alerte dédiée propose explicitement : **Faire coexister**, **Modifier manuellement** (autorité niveau 0) ou **Annuler l’ajout**.

---

## 3. Key Product Decisions & Trade-Offs

- **Suppression conjointe du tag et de la catégorie `Routine`** :
  - *Approche* : Retrait de `tag-routine` des tags par défaut et retrait de `'routine'` du type de catégorie d’activité ; migration automatique des données locales existantes vers `tag-personal` / catégorie `'personal'` (ou `'focus'`/`'work'` selon le cas).
  - *Pourquoi* : Évite toute confusion entre la routine (programme répété) et les thèmes du suivi.

- **Repli des caractéristiques dans Création & de la Routine dans Paramètres** :
  - *Approche* : Les deux listes utilisent un motif cohérent d’accordéon/menu déroulant (`expanded = false` par défaut dans le répertoire) et une recherche texte instantanée dans Création.
  - *Pourquoi* : Garde les écrans lisibles et rapides sur téléphone comme sur ordinateur, tout en donnant accès à toutes les règles quand on souhaite les éditer.

- **Importance verrouillée dans Création** :
  - *Approche* : Le champ `importance` reste stocké sur chaque activité planifiée, mais seul le répertoire **Création** permet de le modifier ; les créations ponctuelles sur le calendrier utilisent `2` (`Unique`) par défaut.
  - *Pourquoi* : Centralise la hiérarchie de priorité à un seul endroit maîtrisé par l’utilisateur, sans alourdir la prise de rendez-vous rapide sur le calendrier.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Persistance Locale (IndexedDB + LS)                 │
│  settings · activities (importance 1..4) · routineSlots · tags · events│
└──────────────┬────────────────────────────────────────┬────────────────┘
               │                                        │
               ▼                                        ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   Moteur d'Ordonnancement    │        │      Volet Suivi (Tags)        │
│ • Répétition RoutineParams   │        │ • Catégories sans "routine"    │
│ • Conflits Niveaux 4 → 1     │        │ • Agrégation par tagId seul    │
│ • Autorité Niveau 0 (Manuel) │        │ • Camembert & Courbes min/max  │
│ • Confirm. obligatoire ≤ 3   │        └────────────────────────────────┘
└──────────────┬───────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Interfaces Épurées                             │
│  • Création  : Recherche + Répertoire compact + Menu déroulant détails │
│  • Paramètres: Menu déroulant Routine (Activité + Horaire) + Générer   │
│  • Planning  : Modale sans sélecteur d'importance + Confirm. conflits  │
└────────────────────────────────────────────────────────────────────────┘
```

### Modèle de données & Migration

- **Importance (`ImportanceLevel`)** : `1 | 2 | 3 | 4` avec libellés stricts :
  - `4` → `'Facultatif'`
  - `3` → `'Irréductible'`
  - `2` → `'Unique'` *(défaut)*
  - `1` → `'Important'`
- **Catégories (`EventCategory`)** : `'sleep' | 'focus' | 'work' | 'health' | 'personal'` (suppression définitive de `'routine'`).
- **Routine dans Paramètres (`RoutineEntry`)** : Liste stockée et éditée dans Paramètres reliant simplement `activityId` (ou titre) + `startMin` + `durationMin` + `daysOfWeek`, répétée jour par jour lors de l’appui sur **Générer le planning**.
- **Migration transparente (`normalizePersistedState`)** :
  - Anciennes importances `'fixed' -> 1`, `'high' -> 3`, `'medium' -> 2`, `'low' -> 4`.
  - Suppression de `tag-routine` et réassignation de la catégorie `'routine'` vers `'personal'`.
  - Mise à jour de la simulation de novembre pour utiliser les nouveaux niveaux et sans `tag-routine`.

### Correspondance interactive

- **Répertoire Création** : Filtre en direct par nom/tag ; clic sur une ligne → ouvre/ferme le menu déroulant des caractéristiques (dont le sélecteur d’importance `Facultatif`, `Unique`, `Irréductible`, `Important`).
- **Menu déroulant Routine (Paramètres)** : Déplie la liste des créneaux de routine → sélecteur d’activité + champ horaire (`HH:mm`), ajout/retrait de ligne ; bouton **Générer le planning** + **Revenir en arrière**.
- **Modale Calendrier** : Aucun sélecteur d’importance ; création libre en niveau `2` (`Unique`) ou via choix d’une activité du répertoire ; en cas de conflit touchant le niveau `3`, `2` ou `1`, affichage de la confirmation détaillée (ou choix `Faire coexister / Modifier / Annuler` si `1` vs `1`).
