// BackgroundController (service worker). Passes the keyboard shortcuts declared in manifest.json to the
// tab they were pressed in. It makes no network requests and holds no page data.

import { COMMAND_MESSAGE, isCommand, type CommandMessage } from "../shared/commands";

// A tab without LexisFlow's content script simply has nobody listening.
chrome.commands?.onCommand.addListener((command, tab) => {
  if (!isCommand(command) || tab?.id === undefined) return;
  const message: CommandMessage = { type: COMMAND_MESSAGE, command };
  void chrome.tabs.sendMessage(tab.id, message).catch(() => {});
});

export {};
