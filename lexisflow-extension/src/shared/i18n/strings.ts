// Curated sentence templates for the SAFINUM test journey (FR-TRN-05, FR-TRN-06).
// Templates take precedence over any free translation.
//
// Source side (fr, en):   `#` stands for one protected value (amount, number, reference…),
//                         `*` for free text that is kept verbatim (a person's name).
// Target side:            `{1}`, `{2}`… place the protected values, `{*}` the verbatim text.
//
// Each row is [French, English]. English may list alternatives; the first is used as output.
// Ewondo, Fulfulde and Duala live in national.json, keyed by the French text.

export type StringRow = readonly [fr: string, en: string | readonly string[]];

export const STRINGS: readonly StringRow[] = [
  // Page chrome
  ["Environnement de test — données fictives, aucune transaction réelle.", "Test environment — fictional data, no real transaction."],
  ["Protocole de test", "Test protocol"],
  ["Retour au hackathon", "Back to hackathon"],
  ["Banque en ligne", "Online banking"],
  ["Solde", "Balance"],
  ["Frais", ["Fee", "Fees"]],
  ["Bénéficiaire", "Beneficiary"],
  ["Récapitulatif", "Summary"],
  ["Confirmation", "Confirmation"],
  ["Votre compte", "Your account"],
  ["Sécurité", "Security"],
  ["Vérifiez toujours le nom et le numéro du bénéficiaire avant de confirmer un transfert.", "Always verify the beneficiary name and number before confirming a transfer."],
  ["Connexion sécurisée", "Secure connection"],
  ["Safinum Pay — environnement de démonstration. Ne saisissez aucune donnée personnelle réelle.", ["Safinum Pay — demonstration environment. Do not enter real personal data.", "Safinum Pay — demonstration environment. Do not enter any real personal data."]],

  // Step 1 — balance
  ["Bonjour, *", "Hello, {*}"],
  ["Consultez votre solde et lancez un transfert en toute sécurité.", ["Check your balance and start a secure transfer.", "Check your balance and start a transfer securely."]],
  ["Solde disponible", "Available balance"],
  ["Numéro de compte : #", ["Account number: {1}", "Account number : {1}"]],
  ["Compte courant", "Current account"],
  ["Effectuer un transfert", "Make a transfer"],
  ["Consulter les frais", "View fees"],
  ["Transactions récentes", "Recent transactions"],
  ["Paiement marchand", "Merchant payment"],
  ["Salaire reçu", "Salary received"],
  ["Transfert reçu", "Transfer received"],
  ["Facture électricité", "Electricity bill"],

  // Step 2 — fees
  ["Frais de transfert", "Transfer fees"],
  ["Choisissez le type de transfert et le montant. Les frais sont calculés automatiquement.", ["Choose the transfer type and amount. Fees are calculated automatically.", "Choose the transfer type and the amount. Fees are calculated automatically."]],
  ["Type d'opération", "Operation type"],
  ["Compte Safinum", "Safinum account"],
  ["Mobile Money", "Mobile Money"],
  ["Autre banque", "Other bank"],
  ["Transfert instantané et gratuit", ["Instant, free transfer", "Instant and free transfer"]],
  ["Frais de # (min. #, max. #)", ["{1} fee (min. {2}, max. {3})", "Fee of {1} (min. {2}, max. {3})"]],
  ["Montant à envoyer", "Amount to send"],
  ["Gratuit", "Free"],
  ["Total à débiter", "Total to debit"],
  ["Solde après opération", ["Balance after transfer", "Balance after operation"]],
  ["Retour", "Back"],
  ["Continuer", "Continue"],

  // Step 3 — beneficiary
  ["Renseignez les informations du destinataire. Vérifiez toujours le numéro avant de valider.", ["Enter the recipient details. Always verify the number before confirming.", "Enter the recipient's details. Always check the number before validating."]],
  ["Ce bénéficiaire n'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer.", ["This beneficiary has never been used on this account. Verify the number before continuing.", "This beneficiary has never been used on this account. Check the number before continuing."]],
  ["Nom du bénéficiaire", "Beneficiary name"],
  ["Numéro de téléphone", "Phone number"],
  ["Motif du transfert", ["Transfer reason", "Reason for transfer"]],
  ["Note (optionnel)", "Note (optional)"],
  ["J'ai vérifié le nom et le numéro du bénéficiaire.", ["I have verified the beneficiary name and phone number.", "I have verified the beneficiary's name and number."]],

  // Step 4 — summary
  ["Vérifiez les informations avant de confirmer le transfert.", "Check the details before confirming the transfer."],
  ["Montant", "Amount"],
  ["Total débité", "Total debited"],
  ["Téléphone", "Phone"],
  ["Référence", "Reference"],
  ["Opération", "Operation"],
  ["Je confirme que les informations ci-dessus sont correctes.", "I confirm the information above is correct."],
  ["Modifier", "Edit"],
  ["Confirmer le transfert", "Confirm transfer"],

  // Step 5 — receipt
  ["Transfert effectué", "Transfer completed"],
  ["Votre transfert a été envoyé avec succès.", "Your transfer was sent successfully."],
  ["Statut", "Status"],
  ["Succès", "Success"],
  ["Nouveau transfert", "New transfer"],

  // Errors and security alerts — meaning must never be weakened (FR-TRN-07, FR-TRN-09)
  ["Une erreur est survenue", "An error occurred"],
  ["Le montant doit être supérieur à zéro.", "The amount must be greater than zero."],
  ["Solde insuffisant pour effectuer ce transfert.", ["Insufficient balance for this transfer.", "Insufficient balance to make this transfer."]],
  ["Alerte de sécurité", ["Security warning", "Security alert"]],
  ["Alerte de sécurité : vérifiez le numéro du bénéficiaire avant de continuer.", ["Security warning: verify the beneficiary phone number before continuing.", "Security alert: check the beneficiary's number before continuing."]],
  ["Vous devez confirmer les informations avant de valider le transfert.", "You must confirm the details before validating the transfer."],
];

/**
 * Extra French/English entries: the banking action words the test rules name, and the security
 * phrases a jury is likely to inject. They are checked by tests in both directions.
 *
 * These have NO Ewondo, Fulfulde or Duala text yet: nobody who speaks those languages has written
 * or reviewed them, and a guessed word on a payment button or a fraud alert is worse than none. In
 * those languages they are left in the source language and flagged "translation unavailable".
 * Add them to national.json (keyed by the French text) once a speaker has supplied them.
 */
export const EXTRA_STRINGS: readonly StringRow[] = [
  // Action words, meaning fixed (Annuler is Cancel, never Continue or Confirm)
  ["Envoyer", "Send"],
  ["Confirmer", "Confirm"],
  ["Annuler", "Cancel"],
  ["Valider", "Validate"],
  ["Virement", "Transfer"],

  // Security alerts
  ["Alerte de sécurité : Tentative de connexion détectée.", ["Security alert: Login attempt detected.", "Security warning: Login attempt detected."]],
  ["Tentative de connexion détectée.", "Login attempt detected."],
  ["Tentative de connexion suspecte détectée.", "Suspicious login attempt detected."],
  ["Transaction suspecte détectée.", "Suspicious transaction detected."],
  ["Votre compte a été temporairement bloqué.", "Your account has been temporarily blocked."],
  ["Ne communiquez jamais votre code PIN ou votre code de vérification.", "Never share your PIN or verification code."],
];
