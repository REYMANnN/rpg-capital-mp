# BALCÃO Onboarding UX & Reliability Design

## Goal

Make account creation fast, forgiving, mobile-friendly and reliable while keeping the existing BALCÃO account architecture. The user should be guided by masks and field-specific feedback instead of having to know Brazilian formatting rules.

## Flow

1. **Sua loja** — business name and type.
2. **Endereço** — CEP first. Once 8 digits are present, look up the address, fill street/neighborhood/city/state and move attention to the number field. All auto-filled fields remain editable.
3. **Seus dados** — phone, CPF/CNPJ and Pix. Inputs accept typing or paste in common forms and render normalized masks as the user types.
4. **Finalizar** — referral source, review, submit.

The form never clears previously entered data after a validation or network error. Navigation remains progressive and simple, with one primary action.

## Masks and normalization

- CEP: digits only internally, visual `00000-000`, max 8 digits.
- Phone: digits only internally, visual `(00) 0000-0000` or `(00) 00000-0000`, max 11 digits.
- CPF/CNPJ: digits only internally, switch automatically between CPF and CNPJ visual masks, max 14 digits, validate check digits.
- Pix type is selected explicitly: `cpf`, `cnpj`, `phone`, `email`, `evp`.
  - CPF/CNPJ/phone reuse their corresponding masks and validators.
  - Phone Pix is normalized for storage to E.164 `+55...`.
  - Email is trimmed/lowercased.
  - EVP is validated as UUID.
- Paste is always allowed. Non-digit punctuation pasted into numeric fields is discarded by normalization before formatting.

## CEP lookup

Use a server-side BALCÃO endpoint so the component is not coupled directly to a third-party URL. The route accepts exactly 8 digits and queries ViaCEP. Successful responses map `logradouro`, `bairro`, `localidade`, and `uf`. A missing/invalid CEP returns a human-readable 404. Network failure does not block manual address entry.

## Validation UX

- Validate each step before advancing.
- Errors are attached to specific fields and focus the first invalid field.
- Required fields expose `aria-invalid` and descriptive messages.
- Pix is explicitly optional, but when the user chooses a type and enters a value it must validate for that type.
- The submit button becomes busy exactly once and prevents double submission.
- Backend errors are mapped to useful messages; entered data remains on screen.

## Backend reliability

The production error `42702` is fixed in `balcao_complete_onboarding` by removing collisions between OUT parameter names and table column names. Return columns become `out_business_id`, `out_store_id`, `out_installation_id`; every SQL reference remains explicitly qualified.

The RPC stays transactional, `SECURITY DEFINER`, `search_path=''`, executable only by `authenticated`. It remains idempotent for an already-authenticated owner: repeated submission updates the same business/profile/store rather than creating duplicates.

The Next.js onboarding route accepts both old and new RPC output names during rollout so deploy order cannot create a temporary incompatibility.

## Login intent

Preserve the already approved distinction:
- **Entrar** + Google with existing BALCÃO account -> management.
- **Entrar** + Google without BALCÃO account -> return to login with a clear “conta não encontrada” path to create account.
- **Criar conta** + Google without account -> onboarding.
- **Criar conta** + Google with existing account -> management, no duplicate account.

## Testing

Tests cover:
- CEP/phone/CPF/CNPJ masks including paste.
- CPF/CNPJ check digits.
- Pix validators and normalizers per type.
- step validation and optional Pix.
- login intent separation.
- migration text regression preventing ambiguous OUT parameter names.
- production build and existing inventory/account test suites.

Production verification must include READY deployment, `/login` 200, unauthenticated account context 401 rather than 500, and no new onboarding 5xx error in runtime logs after deployment.