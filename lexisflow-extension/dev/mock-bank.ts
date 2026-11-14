// Mock of the SAFINUM test journey, following docs/PAGE-MAP.md: same element structure,
// same strings, no attributes that the real page lacks. The URL never changes between
// steps, and banners are inserted directly after the step indicator.

type Operation = "safinum" | "mobile_money" | "other_bank";

const fmt = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;

const RULES: Record<Operation, { label: string; rule: string; fee: (amount: number) => number }> = {
  safinum: { label: "Compte Safinum", rule: "Transfert instantané et gratuit", fee: () => 0 },
  mobile_money: {
    label: "Mobile Money",
    rule: "Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)",
    fee: (a) => Math.min(2500, Math.max(100, Math.round(a * 0.015))),
  },
  other_bank: {
    label: "Autre banque",
    rule: "Frais de 2 % (min. 200 FCFA, max. 5 000 FCFA)",
    fee: (a) => Math.min(5000, Math.max(200, Math.round(a * 0.02))),
  },
};

const BALANCE = 250000;

export function mountMockBank(root: HTMLElement): void {
  const state = {
    step: 1,
    operation: "safinum" as Operation,
    amount: 25000,
    name: "Jean-Paul Mbarga",
    phone: "+237 6 99 12 34 56",
    reason: "Paiement de services",
    note: "",
    verified: false,
    confirmed: false,
    reference: "SAF-2026-7N9NIT",
  };

  const h = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string,
  ): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const add = <T extends Node>(parent: Node, ...children: T[]): T => {
    for (const child of children) parent.appendChild(child);
    return children[0];
  };

  root.innerHTML = "";
  add(root, h("p", "Environnement de test — données fictives, aucune transaction réelle."));
  const steps = add(root, h("ol"));
  for (const [i, name] of ["Solde", "Frais", "Bénéficiaire", "Récapitulatif", "Confirmation"].entries()) {
    const li = add(steps, h("li"));
    add(li, h("span", String(i + 1)), h("span", name));
  }
  const layout = add(root, h("div"));
  const section = add(layout, h("section"));
  const aside = add(layout, h("aside"));
  add(aside, h("h2", "Sécurité"));
  add(aside, h("p", "Vérifiez toujours le nom et le numéro du bénéficiaire avant de confirmer un transfert."));

  const clearBanner = () => root.querySelector(".banner")?.remove();
  const banner = (kind: "red" | "amber", title: string, message: string, code?: string) => {
    clearBanner();
    const box = h("div", undefined, `banner mb-6 flex border border-${kind}-300 bg-${kind}-50`);
    const body = add(box, h("div"));
    add(body, h("p", title), h("p", message));
    if (code) add(body, h("p", code));
    steps.after(box);
  };
  const error = (message: string, code: string) => banner("red", "Une erreur est survenue", message, code);

  const button = (label: string, onClick: () => void) => {
    const b = h("button", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const go = (step: number) => {
    state.step = step;
    clearBanner();
    render();
  };
  const field = (parent: Node, label: string, input: HTMLElement) => {
    const wrap = add(parent, h("div"));
    add(wrap, h("label", label), input);
  };
  const pairs = (parent: Node, rows: [string, string][]) => {
    const dl = add(parent, h("dl"));
    for (const [term, value] of rows) {
      const row = add(dl, h("div"));
      add(row, h("dt", term), h("dd", value));
    }
  };

  function render(): void {
    const card = h("div");
    const fee = RULES[state.operation].fee(state.amount);
    const actions = h("div");

    if (state.step === 1) {
      add(card, h("p", "Votre compte"), h("h1", "Bonjour, Amina"));
      add(card, h("p", "Consultez votre solde et lancez un transfert en toute sécurité."));
      add(card, h("p", "Solde disponible"), h("p", fmt(BALANCE), "amount"));
      add(card, h("p", "Numéro de compte : CM 001 2345 6789 01"), h("p", "Compte courant"));
      add(actions, button("Effectuer un transfert", () => go(2)), button("Consulter les frais", () => go(2)));
      add(card, actions, h("h2", "Transactions récentes"));
      for (const [label, date, amount] of [
        ["Paiement marchand", "05 nov. 2026", "-12 500 FCFA"],
        ["Salaire reçu", "04 nov. 2026", "+180 000 FCFA"],
      ]) {
        const row = add(card, h("div", undefined, "row"));
        const left = add(row, h("div"));
        add(left, h("p", label), h("p", date));
        add(row, h("p", amount));
      }
    } else if (state.step === 2) {
      add(card, h("p", "Frais de transfert"));
      add(card, h("h2", "Choisissez le type de transfert et le montant. Les frais sont calculés automatiquement."));
      const select = h("select");
      for (const [value, rule] of Object.entries(RULES)) {
        const option = add(select, h("option", rule.label));
        option.value = value;
      }
      select.value = state.operation;
      const ruleText = h("p", RULES[state.operation].rule);
      const amountInput = h("input");
      amountInput.type = "number";
      amountInput.value = String(state.amount);
      const feeValue = h("span", fmt(fee));
      const totalValue = h("span", fmt(state.amount + fee));
      const afterValue = h("span", fmt(BALANCE - state.amount - fee));
      const refresh = () => {
        const f = RULES[state.operation].fee(state.amount);
        ruleText.textContent = RULES[state.operation].rule;
        feeValue.textContent = fmt(f);
        totalValue.textContent = fmt(state.amount + f);
        afterValue.textContent = fmt(BALANCE - state.amount - f);
      };
      select.addEventListener("change", () => {
        state.operation = select.value as Operation;
        refresh();
      });
      amountInput.addEventListener("input", () => {
        state.amount = Number(amountInput.value) || 0;
        refresh();
      });
      field(card, "Type d'opération", select);
      add(card, ruleText);
      field(card, "Montant à envoyer", amountInput);
      for (const [label, value] of [
        ["Frais", feeValue],
        ["Total à débiter", totalValue],
        ["Solde après opération", afterValue],
      ] as const) {
        const row = add(card, h("div", undefined, "row"));
        add(row, h("span", label), value);
      }
      add(
        actions,
        button("Retour", () => go(1)),
        button("Continuer", () => {
          if (state.amount <= 0) return error("Le montant doit être supérieur à zéro.", "AMOUNT_001");
          if (state.amount + RULES[state.operation].fee(state.amount) > BALANCE) {
            return error("Solde insuffisant pour effectuer ce transfert.", "AMOUNT_002");
          }
          go(3);
        }),
      );
      add(card, actions);
    } else if (state.step === 3) {
      add(card, h("p", "Bénéficiaire"));
      add(card, h("h2", "Renseignez les informations du destinataire. Vérifiez toujours le numéro avant de valider."));
      const notice = add(card, h("div", undefined, "border border-amber-300 bg-amber-50"));
      add(notice, h("p", "Ce bénéficiaire n'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer."));
      const text = (key: "name" | "phone" | "reason", type: string) => {
        const input = h("input");
        input.type = type;
        input.value = state[key];
        input.addEventListener("input", () => (state[key] = input.value));
        return input;
      };
      field(card, "Nom du bénéficiaire", text("name", "text"));
      field(card, "Numéro de téléphone", text("phone", "tel"));
      field(card, "Motif du transfert", text("reason", "text"));
      const note = h("textarea");
      note.value = state.note;
      note.addEventListener("input", () => (state.note = note.value));
      field(card, "Note (optionnel)", note);
      const check = h("input");
      check.type = "checkbox";
      check.checked = state.verified;
      check.addEventListener("change", () => (state.verified = check.checked));
      const label = add(card, h("label"));
      add(label, check, h("span", "J'ai vérifié le nom et le numéro du bénéficiaire."));
      add(
        actions,
        button("Retour", () => go(2)),
        button("Continuer", () => {
          if (!state.verified) {
            return banner(
              "amber",
              "Alerte de sécurité",
              "Alerte de sécurité : vérifiez le numéro du bénéficiaire avant de continuer.",
              "SECURITY_001",
            );
          }
          go(4);
        }),
      );
      add(card, actions);
    } else if (state.step === 4) {
      add(card, h("p", "Récapitulatif"), h("h2", "Vérifiez les informations avant de confirmer le transfert."));
      pairs(card, [
        ["Montant", fmt(state.amount)],
        ["Frais", fmt(fee)],
        ["Total débité", fmt(state.amount + fee)],
        ["Bénéficiaire", state.name],
        ["Téléphone", state.phone],
        ["Référence", state.reference],
        ["Opération", RULES[state.operation].label],
      ]);
      const check = h("input");
      check.type = "checkbox";
      check.addEventListener("change", () => (state.confirmed = check.checked));
      const label = add(card, h("label"));
      add(label, check, h("span", "Je confirme que les informations ci-dessus sont correctes."));
      add(
        actions,
        button("Modifier", () => go(3)),
        button("Confirmer le transfert", () => {
          if (!state.confirmed) {
            return error("Vous devez confirmer les informations avant de valider le transfert.", "CONFIRM_001");
          }
          go(5);
        }),
      );
      add(card, actions);
    } else {
      add(card, h("h2", "Transfert effectué"), h("p", "Votre transfert a été envoyé avec succès."));
      pairs(card, [
        ["Référence", state.reference],
        ["Montant", fmt(state.amount)],
        ["Frais", fmt(fee)],
        ["Total débité", fmt(state.amount + fee)],
        ["Bénéficiaire", state.name],
        ["Statut", "Succès"],
      ]);
      add(actions, button("Nouveau transfert", () => { state.verified = state.confirmed = false; go(1); }));
      add(card, actions);
    }
    section.replaceChildren(card);
  }
  render();

  // Jury simulation: content the extension has never seen, injected after load.
  const dev = add(root, h("div", undefined, "dev"));
  add(dev, h("span", "Simulation jury : "));
  add(
    dev,
    button("Alerte fraude inédite", () =>
      banner("amber", "Alerte de sécurité", "Tentative de fraude détectée : ne communiquez jamais votre code PIN. Montant bloqué : 75 000 FCFA."),
    ),
    button("Texte inédit", () => {
      const target = section.firstElementChild ?? section;
      add(target, h("p", "Offre spéciale : 0 FCFA de frais jusqu'au 30 nov. 2026."));
    }),
    button("Message connu ajouté", () => {
      const target = section.firstElementChild ?? section;
      add(target, h("p", "Solde insuffisant pour effectuer ce transfert."));
    }),
  );
  for (let step = 1; step <= 5; step++) add(dev, button(`étape ${step}`, () => go(step)));
}
