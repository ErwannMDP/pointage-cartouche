# Pointage

Petite appli iPhone pour pointer ses heures d'arrivée et de départ. Les heures sont écrites directement dans le Google Sheets de suivi (onglet `Pointage`).

- **Interface** : web-app installable (PWA) hébergée sur GitHub Pages. Elle s'ajoute à l'écran d'accueil de l'iPhone et s'ouvre en plein écran.
- **Connexion au tableau** : un script Google Apps Script relié au tableau sert d'API. Il trouve la ligne du jour, écrit l'heure dans `Arrivée` ou `Départ` et renvoie le récap du jour et de la semaine.

```
iPhone (PWA) ──HTTPS──> Apps Script (/exec) ──> Google Sheets « Pointage »
```

## Mise en place

### 1. Le script Google (une seule fois)

1. Dans le Google Sheets : **Extensions > Apps Script**.
2. Remplacer tout le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistrer.
3. Dans la liste des fonctions en haut, choisir **`setup`** puis **Exécuter**. Google demande une autorisation : choisir le compte, puis *Paramètres avancés > Accéder au projet > Autoriser*.
4. Le **code d'accès** s'affiche dans le journal d'exécution. Le garder.
5. **Déployer > Nouveau déploiement > Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde** (le code d'accès protège l'écriture)
6. Copier l'**URL de l'application Web** (elle finit par `/exec`).

Après une modification du script : *Déployer > Gérer les déploiements > Modifier > Nouvelle version*. L'URL ne change pas.

### 2. Sur l'iPhone

1. Ouvrir l'adresse GitHub Pages du repo dans **Safari**.
2. Bouton **Partager > Sur l'écran d'accueil**.
3. Ouvrir l'appli depuis l'écran d'accueil, puis saisir le prénom, l'URL `/exec` et le code d'accès. Les réglages restent enregistrés sur le téléphone. La roue crantée permet de les modifier.

La saisie se fait dans l'appli installée, et non dans Safari : sur iPhone, les deux ne partagent pas leurs données.

## Utilisation

- La date et l'heure du jour sont remplies automatiquement. Le bouton calendrier permet de choisir un autre jour pour rattraper un oubli.
- **Arrivée** le matin, **Départ** le soir. L'appli passe d'elle-même sur « Départ » une fois l'arrivée enregistrée.
- L'heure peut être modifiée avant de valider. Si une heure existe déjà, l'appli demande avant de la remplacer.
- Une pause différente d'1 h peut être indiquée au départ. Sinon, la pause par défaut de l'onglet `Réglages` s'applique.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | Interface de l'appli |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur l'écran d'accueil et démarrage hors ligne |
| `apps-script/Code.gs` | API à coller dans le Google Sheets |

Le code d'accès et l'URL du script ne sont jamais enregistrés dans ce repo : ils restent sur le téléphone.
