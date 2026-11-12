---
name: maestri-bridge
description: Show code to the user in their editor (VS Code, Cursor, Windsurf) through the Maestri Bridge extension. Opens a file, highlights lines and leaves a Markdown note below them that the user can reply to. Use when the user asks you to show, point to, open or walk them through code, or when pointing at exact lines makes an explanation clearer.
---

# Show code in the user's editor

Maestri Bridge is an editor extension that connects the user's editor to Maestri. With it, you can open a file in the user's editor, highlight lines and leave a note below them. The user reads the note next to the code and can reply from the same box. The reply comes back to your terminal as a normal message, with the highlighted code attached.

## How to use it

Run the script that ships with this skill:

```sh
scripts/show-in-editor.sh [--new] [--from NAME] FILE[:LINE[-END]] [NOTE | -]
```

The path is relative to this skill's folder. Examples:

```sh
scripts/show-in-editor.sh --new src/auth/session.ts:42-58 "This is where the token is refreshed. The **expiry check** on line 47 runs before the network call."

scripts/show-in-editor.sh src/auth/session.ts:12 "And this is the type it returns."

scripts/show-in-editor.sh src/routes.ts
```

- `FILE` can be relative to your current directory or absolute. The file must be inside the folder the user has open in the editor.
- `:LINE` or `:START-END` picks the lines to highlight. Lines start at 1, as the editor shows them.
- `NOTE` is Markdown. Pass `-` to read a longer note from standard input. Without a note, the file just opens with the lines selected.
- `--new` starts a new tour. Without it, notes sent within two minutes of each other join the same tour, and the user steps through them with the arrows on each note.
- `--from NAME` sets the name on the note. Without it, the extension uses your name in Maestri when it can find you, or "Agent".
- `--editor cursor` (or `windsurf`, `vscode-insiders`, `vscodium`) targets another editor. You can also set `MAESTRI_BRIDGE_EDITOR`.
- `--print` prints the link instead of opening it.

The script reads `MAESTRI_TERMINAL_ID` from the environment. That's how replies find their way back to you, so run it from your own Maestri terminal.

## Walking the user through code

1. Plan the stops in the order the user should read them.
2. Send the first one with `--new`, then the others without it, one command per stop.
3. Keep each note short: what this code does and why it matters for the question. Point at the exact lines instead of describing where they are.
4. Tell the user in your reply that the notes are in their editor and how many there are.

To add to a stop you already sent, send the same file and lines again. The new note is added to that box instead of creating another stop.

## Replies

When the user replies on a note, you get a message like this:

````text
Why is it 47 and not 46?

Reference: src/auth/session.ts:42-58 (typescript)
```typescript
...
```
````

Answer it like any other message. If the answer is about specific lines, send a new note there.

## Without the script

The script only builds and opens this link:

```text
vscode://maestri-bridge.maestri-bridge/show?file=<path>&lines=<N or N-M>&text=<note>&agent=<MAESTRI_TERMINAL_ID>&from=<name>&new=1
```

Every value must be URL-encoded. Only `file` is required. Open it with `open` on macOS, `xdg-open` on Linux or `start` on Windows.

## When it doesn't work

- Nothing happens, or the editor says no extension handles the link: the user needs to install Maestri Bridge (https://github.com/PierreOliveira1/maestri-bridge) and pair it with Maestri. The first time, the editor also asks the user to allow the extension to open the link, so tell them to click **Open**.
- The editor warns the file is outside the open folders: the user has a different folder open. Ask them to open the project folder, or show the path in your reply instead.
- The editor says agent links are turned off: the user disabled `maestriBridge.agentLinks`. Don't insist; explain in text.

## Rules

- Only show files from the project the user is working on.
- Never put secrets, tokens or credentials in a note.
- Don't open more than about ten stops in one tour. Split long explanations into separate tours.
