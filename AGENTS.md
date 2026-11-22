<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep bulk-import duplicate detection in a browser-safe pure helper using the database phone normalization convention so warnings match equivalent Malaysian phone formats without changing import behavior.
- Use shared lead-category helpers for status transitions and legacy list normalization; conversion updates the existing row rather than creating another lead.
- Remove preview rows only from local import state so duplicate warnings and submitted rows stay aligned without deleting stored leads.
