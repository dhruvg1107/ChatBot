const PERSONAS = [
  {
    id: "universal",
    name: "Aether",
    avatar: "AI",
    tagline: "Balanced Assistant",
    systemPrompt: "You are Aether, a clear, helpful, practical AI assistant. Give accurate answers, explain when useful, and keep the conversation natural.",
    welcomeMsg: "Hi, I am Aether. Ask me anything and I will keep it clear, useful, and grounded."
  },
  {
    id: "coder",
    name: "Orion",
    avatar: "</>",
    tagline: "Code & Debug Helper",
    systemPrompt: "You are Orion, a senior coding assistant. Explain bugs clearly, suggest robust fixes, and produce clean code.",
    welcomeMsg: "Orion online. Send the bug, feature, or code idea and I will help shape it."
  },
  {
    id: "creative",
    name: "Lyra",
    avatar: "WR",
    tagline: "Creative Writer",
    systemPrompt: "You are Lyra, a creative writing assistant. Help with stories, scripts, names, rewrites, and polished wording.",
    welcomeMsg: "Lyra here. Give me a rough idea and we can turn it into something polished."
  },
  {
    id: "study",
    name: "Nova",
    avatar: "ST",
    tagline: "Study Coach",
    systemPrompt: "You are Nova, a patient study coach. Break concepts into simple steps, use examples, and quiz the user when helpful.",
    welcomeMsg: "Nova ready. What topic are we making easier today?"
  }
];

let MODEL_OPTIONS = [
  { val: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B Instruct (Free)" },
  { val: "google/gemini-2.5-flash:free", name: "Gemini 2.5 Flash (Free)" },
  { val: "qwen/qwen-2.5-72b-instruct:free", name: "Qwen 2.5 72B (Free)" },
  { val: "microsoft/phi-3-medium-128k-instruct:free", name: "Phi-3 Medium (Free)" }
];

class AetherChatApp {
  constructor() {
    this.chats = this.load("aether_chats_split", []);
    this.settings = this.load("aether_settings_split", {
      provider: "openrouter",
      model: MODEL_OPTIONS[0].val,
      temp: 0.7,
      theme: "glass",
      systemPromptOverride: "",
      ttsEnabled: false
    });
    this.activeChatId = this.load("aether_active_chat_split", null);
    this.selectedPersonaId = "universal";
    this.isGenerating = false;
    this.speechRecognition = null;
    this.speechSynthesis = window.speechSynthesis;

    this.cacheDom();
    this.initTheme();
    this.renderPersonas();
    this.ensureChat();
    this.renderChatList();
    this.loadActiveChat();
    this.registerEvents();
    this.updateSettingsUI();
    this.loadModels();
    this.initSpeechRecognition();
    feather.replace();
  }

  cacheDom() {
    const id = (name) => document.getElementById(name);
    this.dom = {
      sidebar: id("app-sidebar"), sidebarBackdrop: id("sidebar-backdrop"), menuOpen: id("menu-open-btn"), menuClose: id("menu-close-btn"),
      newChat: id("new-chat-btn"), chatSearch: id("chat-search"), chatList: id("chat-list"), chatMessages: id("chat-messages"),
      chatInput: id("chat-input"), send: id("btn-send-message"), clear: id("btn-clear-chat"), export: id("btn-export-chat"),
      personaRibbon: id("persona-ribbon"), activeAvatar: id("active-avatar"), activeName: id("active-name"), activeTagline: id("active-tagline"),
      settingsModal: id("settings-modal"), openSettings: id("open-settings-btn"), closeSettings: id("close-settings-btn"),
      provider: id("settings-provider"), apiKeySection: id("apikey-section"), apiKeyLabel: id("apikey-label"),
      modelSection: id("model-section"), model: id("settings-model"), temp: id("settings-temp"), tempDisplay: id("temp-display"),
      systemPrompt: id("settings-system-prompt"), saveSettings: id("btn-save-settings"), themeCards: document.querySelectorAll(".theme-card"),
      tts: id("btn-tts-toggle"), speech: id("btn-speech-recognition")
    };
  }

  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }

  save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  initTheme() {
    document.body.setAttribute("data-theme", this.settings.theme === "glass" ? "" : this.settings.theme);
    if (this.settings.theme === "glass") document.body.removeAttribute("data-theme");
  }

  ensureChat() {
    if (!this.chats.length) this.createChat(false);
    if (!this.chats.some(chat => chat.id === this.activeChatId)) this.activeChatId = this.chats[0].id;
  }

  createChat(render = true) {
    const persona = this.currentPersona();
    const chat = {
      id: `chat_${Date.now()}`,
      title: "New Dialogue",
      personaId: persona.id,
      messages: [],
      createdAt: new Date().toISOString()
    };
    this.chats.unshift(chat);
    this.activeChatId = chat.id;
    this.saveAll();
    if (render) {
      this.renderChatList();
      this.loadActiveChat();
    }
  }

  saveAll() {
    this.save("aether_chats_split", this.chats);
    this.save("aether_active_chat_split", this.activeChatId);
  }

  currentChat() {
    return this.chats.find(chat => chat.id === this.activeChatId);
  }

  currentPersona() {
    return PERSONAS.find(p => p.id === this.selectedPersonaId) || PERSONAS[0];
  }

  renderPersonas() {
    this.dom.personaRibbon.innerHTML = "";
    PERSONAS.forEach(persona => {
      const button = document.createElement("button");
      button.className = `persona-pill ${persona.id === this.selectedPersonaId ? "selected" : ""}`;
      button.textContent = persona.name;
      button.addEventListener("click", () => this.selectPersona(persona.id));
      this.dom.personaRibbon.appendChild(button);
    });
  }

  selectPersona(personaId) {
    this.selectedPersonaId = personaId;
    const chat = this.currentChat();
    if (chat && !chat.messages.length) chat.personaId = personaId;
    this.renderPersonas();
    this.loadActiveChat();
    this.saveAll();
  }

  renderChatList() {
    const query = this.dom.chatSearch.value.toLowerCase();
    this.dom.chatList.innerHTML = "";
    this.chats.filter(chat => chat.title.toLowerCase().includes(query) || chat.messages.some(m => m.content.toLowerCase().includes(query))).forEach(chat => {
      const item = document.createElement("div");
      item.className = `history-item ${chat.id === this.activeChatId ? "active" : ""}`;
      item.innerHTML = `<span>${this.escape(chat.title)}</span><small>${chat.messages.length} messages</small>`;
      item.addEventListener("click", () => {
        this.activeChatId = chat.id;
        this.loadActiveChat();
        this.renderChatList();
        this.saveAll();
      });
      this.dom.chatList.appendChild(item);
    });
  }

  loadActiveChat() {
    const chat = this.currentChat();
    if (!chat) return;
    this.selectedPersonaId = chat.personaId || "universal";
    const persona = this.currentPersona();
    this.dom.activeAvatar.textContent = persona.avatar;
    this.dom.activeName.textContent = persona.name;
    this.dom.activeTagline.textContent = persona.tagline;
    this.dom.chatMessages.innerHTML = "";
    if (!chat.messages.length) {
      this.appendBubble("bot", persona.welcomeMsg, false);
    } else {
      chat.messages.forEach(msg => this.appendBubble(msg.role, msg.content, false));
    }
    this.renderPersonas();
  }

  appendBubble(role, content, scroll = true) {
    const row = document.createElement("div");
    row.className = `message-row ${role === "user" ? "user-row" : "bot-row"}`;
    const safeContent = role === "bot" ? this.markdown(content) : this.escape(content);
    row.innerHTML = `<div class="message-bubble ${role === "user" ? "user-bubble" : "bot-bubble"}">${safeContent}</div>`;
    this.dom.chatMessages.appendChild(row);
    if (scroll) this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  showTyping() {
    const row = document.createElement("div");
    row.className = "message-row bot-row typing-row";
    row.innerHTML = `<div class="message-bubble bot-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
    this.dom.chatMessages.appendChild(row);
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  removeTyping() {
    this.dom.chatMessages.querySelector(".typing-row")?.remove();
  }

  async sendMessage() {
    if (this.isGenerating) return;
    const text = this.dom.chatInput.value.trim();
    if (!text) return;

    const chat = this.currentChat();
    if (!chat) return;
    if (!chat.messages.length) chat.title = text.slice(0, 32);

    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    chat.messages.push(userMsg);
    this.appendBubble("user", text);
    this.dom.chatInput.value = "";
    this.adjustInputHeight();
    this.isGenerating = true;
    this.showTyping();

    try {
      const reply = this.settings.provider === "local" ? await this.localReply(text) : await this.askBackend(chat.messages);
      const botMsg = { role: "bot", content: reply, timestamp: new Date().toISOString() };
      chat.messages.push(botMsg);
      this.removeTyping();
      this.appendBubble("bot", reply);
      if (this.settings.ttsEnabled) this.speak(reply);
    } catch (error) {
      this.removeTyping();
      this.appendBubble("bot", `Connection failed: ${error.message}`);
    } finally {
      this.isGenerating = false;
      this.saveAll();
      this.renderChatList();
    }
  }

  async askBackend(messages) {
    const persona = this.currentPersona();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.validModel(),
        temperature: this.settings.temp,
        systemPrompt: this.settings.systemPromptOverride || persona.systemPrompt,
        messages
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Backend error ${response.status}`);
    return data.reply;
  }

  async loadModels() {
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.models) || !data.models.length) return;
      MODEL_OPTIONS = data.models.map(id => ({
        val: id,
        name: `${this.modelLabel(id)} (Free)`
      }));
      if (!MODEL_OPTIONS.some(model => model.val === this.settings.model)) {
        this.settings.model = MODEL_OPTIONS[0].val;
        this.save("aether_settings_split", this.settings);
      }
      this.updateSettingsUI();
    } catch (error) {
      console.warn("Could not refresh OpenRouter free models:", error);
    }
  }

  localReply(text) {
    return new Promise(resolve => {
      setTimeout(() => resolve(`Local preview mode is active. You said: "${text}". Switch to OpenRouter in Settings for live free-model responses.`), 350);
    });
  }

  validModel() {
    return MODEL_OPTIONS.some(model => model.val === this.settings.model) ? this.settings.model : MODEL_OPTIONS[0].val;
  }

  modelLabel(id) {
    return id
      .replace(":free", "")
      .split("/")
      .pop()
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  updateSettingsUI() {
    this.dom.provider.value = this.settings.provider;
    this.dom.temp.value = this.settings.temp;
    this.dom.tempDisplay.textContent = this.settings.temp;
    this.dom.systemPrompt.value = this.settings.systemPromptOverride;
    this.dom.model.innerHTML = "";
    MODEL_OPTIONS.forEach(model => {
      const option = document.createElement("option");
      option.value = model.val;
      option.textContent = model.name;
      option.selected = this.validModel() === model.val;
      this.dom.model.appendChild(option);
    });
    const isLive = this.settings.provider === "openrouter";
    this.dom.apiKeySection.style.display = isLive ? "flex" : "none";
    this.dom.modelSection.style.display = isLive ? "flex" : "none";
    this.dom.apiKeyLabel.textContent = "OPENROUTER API KEY";
    this.dom.themeCards.forEach(card => card.classList.toggle("active", card.dataset.themeId === this.settings.theme));
    this.dom.tts.classList.toggle("active", this.settings.ttsEnabled);
  }

  saveSettings() {
    this.settings.provider = this.dom.provider.value;
    this.settings.model = this.dom.model.value || MODEL_OPTIONS[0].val;
    this.settings.temp = parseFloat(this.dom.temp.value);
    this.settings.systemPromptOverride = this.dom.systemPrompt.value.trim();
    this.save("aether_settings_split", this.settings);
    this.closeSettings();
  }

  switchTheme(theme) {
    this.settings.theme = theme;
    this.initTheme();
    this.save("aether_settings_split", this.settings);
    this.updateSettingsUI();
  }

  clearChat() {
    const chat = this.currentChat();
    if (!chat || !confirm("Clear this chat?")) return;
    chat.messages = [];
    this.saveAll();
    this.loadActiveChat();
    this.renderChatList();
  }

  exportChat() {
    const chat = this.currentChat();
    if (!chat) return;
    const lines = [`# ${chat.title}`, "", ...chat.messages.map(m => `## ${m.role}\n${m.content}\n`)];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${chat.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_chat.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  openSettings() { this.dom.settingsModal.style.display = "flex"; this.updateSettingsUI(); }
  closeSettings() { this.dom.settingsModal.style.display = "none"; }
  openSidebar() { this.dom.sidebar.classList.add("open"); this.dom.sidebarBackdrop.classList.add("show"); }
  closeSidebar() { this.dom.sidebar.classList.remove("open"); this.dom.sidebarBackdrop.classList.remove("show"); }

  adjustInputHeight() {
    this.dom.chatInput.style.height = "24px";
    this.dom.chatInput.style.height = `${this.dom.chatInput.scrollHeight - 6}px`;
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.dom.speech.style.display = "none";
      return;
    }
    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = false;
    this.speechRecognition.interimResults = false;
    this.speechRecognition.onresult = event => {
      const text = event.results[0][0].transcript;
      this.dom.chatInput.value += `${this.dom.chatInput.value ? " " : ""}${text}`;
      this.adjustInputHeight();
    };
  }

  speak(text) {
    if (!this.speechSynthesis) return;
    this.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, "code omitted"));
    this.speechSynthesis.speak(utterance);
  }

  markdown(text) {
    return this.escape(text)
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  escape(text) {
    return String(text).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }

  registerEvents() {
    this.dom.send.addEventListener("click", () => this.sendMessage());
    this.dom.chatInput.addEventListener("input", () => this.adjustInputHeight());
    this.dom.chatInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
    });
    this.dom.newChat.addEventListener("click", () => this.createChat());
    this.dom.chatSearch.addEventListener("input", () => this.renderChatList());
    this.dom.clear.addEventListener("click", () => this.clearChat());
    this.dom.export.addEventListener("click", () => this.exportChat());
    this.dom.openSettings.addEventListener("click", () => this.openSettings());
    this.dom.closeSettings.addEventListener("click", () => this.closeSettings());
    this.dom.settingsModal.addEventListener("click", event => { if (event.target === this.dom.settingsModal) this.closeSettings(); });
    this.dom.provider.addEventListener("change", () => { this.settings.provider = this.dom.provider.value; this.updateSettingsUI(); });
    this.dom.temp.addEventListener("input", () => { this.dom.tempDisplay.textContent = this.dom.temp.value; });
    this.dom.saveSettings.addEventListener("click", () => this.saveSettings());
    this.dom.themeCards.forEach(card => card.addEventListener("click", () => this.switchTheme(card.dataset.themeId)));
    this.dom.tts.addEventListener("click", () => { this.settings.ttsEnabled = !this.settings.ttsEnabled; this.save("aether_settings_split", this.settings); this.updateSettingsUI(); });
    this.dom.speech.addEventListener("click", () => this.speechRecognition?.start());
    this.dom.menuOpen.addEventListener("click", () => this.openSidebar());
    this.dom.menuClose.addEventListener("click", () => this.closeSidebar());
    this.dom.sidebarBackdrop.addEventListener("click", () => this.closeSidebar());
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new AetherChatApp();
});
