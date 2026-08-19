// Legal / support configuration.
// ⚠️ À PERSONNALISER : remplacez ces valeurs par vos informations réelles.
export const SUPPORT_EMAIL = "contact@werpadel.app";
export const ORG_NAME = "weRpadel";
export const PRIVACY_LAST_UPDATED = "Juin 2026";
// URL publique de la politique (à renseigner aussi dans App Store Connect). Optionnel côté app.
export const PRIVACY_POLICY_URL = "";

export const PRIVACY_POLICY = `Dernière mise à jour : ${PRIVACY_LAST_UPDATED}

Cette politique de confidentialité décrit comment l'application mobile weRpadel (« l'Application », « nous ») collecte, utilise et protège vos données personnelles. En utilisant l'Application, vous acceptez les pratiques décrites ci-dessous.

Responsable du traitement : ${ORG_NAME} — ${SUPPORT_EMAIL}.

1. Données que nous collectons

Données de compte (que vous fournissez) : adresse e-mail, pseudonyme (public), nom et prénom (privés), date de naissance / âge (privé), numéro de téléphone (privé), ville et région préférée, niveau de jeu et bio (facultatif), photo de profil (facultatif).

Données d'utilisation : matchs créés, rejoints et historique, messages échangés avec les autres joueurs, notes de fiabilité données et reçues, clubs favoris.

Localisation : position approximative de l'appareil, uniquement lorsque vous l'autorisez, afin d'afficher les clubs de padel proches de vous. Nous ne suivons pas votre position en continu et ne la stockons pas de façon permanente.

Données techniques : identifiant de compte, jeton de notification push (si activé), informations de base sur l'appareil.

Abonnements : les paiements sont traités par l'App Store (Apple) et Google Play, via RevenueCat pour la gestion des abonnements. Nous ne collectons ni ne stockons vos données bancaires ; elles sont gérées par Apple / Google.

2. Comment nous utilisons vos données

Créer et gérer votre compte ; vous permettre de créer / rejoindre des matchs et de contacter d'autres joueurs ; afficher les clubs proches (localisation) ; vous envoyer des notifications (rappels de match, alertes de nouveau match) si vous les activez ; gérer votre abonnement Premium ; assurer la sécurité et le bon fonctionnement du service.

Nous ne vendons pas vos données et ne les utilisons pas pour de la publicité tierce.

3. Informations visibles par les autres utilisateurs

Les autres joueurs voient vos informations publiques : pseudonyme, photo de profil, niveau, bio et note de fiabilité. Vos informations privées (nom, prénom, téléphone, date de naissance, e-mail) ne sont pas affichées publiquement.

4. Partage des données

Nous partageons des données uniquement avec les prestataires nécessaires au fonctionnement de l'Application : Apple App Store / Google Play et RevenueCat (abonnements) ; hébergeur / base de données (stockage sécurisé) ; service de notifications push ; fournisseur météo Open-Meteo (coordonnées du club uniquement, aucune donnée personnelle). Nous pouvons divulguer des données si la loi l'exige.

5. Conservation des données

Nous conservons vos données tant que votre compte est actif. Lorsque vous supprimez votre compte depuis l'Application, vos données personnelles sont supprimées (suppression en cascade : profil, matchs, messages et notes), sous réserve des obligations légales.

6. Vos droits (RGPD)

Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Vous pouvez modifier vos informations directement dans l'Application (Profil), supprimer votre compte depuis l'Application, ou nous contacter à ${SUPPORT_EMAIL}. Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).

7. Sécurité

Vos mots de passe sont stockés de manière chiffrée (hachage). Les données sont transmises via des connexions sécurisées (HTTPS). Malgré nos efforts, aucune méthode de transmission n'est totalement infaillible.

8. Enfants

weRpadel n'est pas destinée aux personnes de moins de 15 ans. Nous ne collectons pas sciemment de données concernant des mineurs de moins de 15 ans.

9. Modifications de cette politique

Nous pouvons mettre à jour cette politique. Toute modification sera publiée sur cette page avec une nouvelle date de mise à jour.

10. Contact

Pour toute question relative à cette politique ou à vos données personnelles : ${ORG_NAME} — ${SUPPORT_EMAIL}.`;
