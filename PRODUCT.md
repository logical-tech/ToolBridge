# Product

## Register
product

## Users
Sviluppatori e team tecnici che integrano servizi esterni (GitHub, Slack, …) nei loro
agenti/app. Contesto d'uso: connettono account, sfogliano i tool disponibili, controllano
lo stato delle connessioni e i log di esecuzione. Sono in un task, non in esplorazione.

## Product Purpose
Tool Bridge è un layer di integrazione (tipo Composio) self-hostable: registri le credenziali
di un'app, connetti account (OAuth / GitHub App / api-key), ed esponi centinaia di tool
tipizzati a un LLM/MCP con auth, refresh token e webhook gestiti. Successo = lo sviluppatore
connette un servizio e lancia un tool in meno di un minuto, con fiducia totale nello stato.

## Brand Personality
Preciso, denso, silenzioso. Tre parole: **affilato, affidabile, tecnico**. L'interfaccia
sparisce nel task come Linear/Raycast/Stripe: neutri tirati, un solo accento (emerald =
"connesso/attivo"), tipografia UI, densità informativa alta senza rumore. Nessuna decorazione.

## Anti-references
- SaaS-cream / warm-neutral near-white con card colorate ovunque.
- Dashboard "enterprise" generica con gradienti, hero-metric giganti, eyebrow uppercase.
- Card identiche icona+titolo+testo ripetute; bordi laterali colorati; glassmorphism.

## Design Principles
1. **Il tool sparisce nel task** — familiarità guadagnata, zero affordance inventate.
2. **Lo stato è sempre leggibile** — connesso/pending/errore chiari a colpo d'occhio; l'accento
   emerald segnala solo stato e azione primaria, mai decorazione.
3. **Densità senza rumore** — molti tool/log stanno in tabelle compatte; la gerarchia la fa
   spaziatura e peso, non colore.
4. **Ogni componente ha tutti gli stati** — hover/focus/active/disabled/loading/error, empty
   states che insegnano l'interfaccia.

## Accessibility & Inclusion
WCAG AA: body ≥4.5:1, focus ring visibile su tutti gli interattivi, target ≥ 32px,
`prefers-reduced-motion` rispettato, tema light+dark entrambi conformi.
