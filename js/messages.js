// ============================================================
// CivicAudit — messages.js
// ============================================================

let msgProfile = null;
let activePartnerId = null;
let activeProjectId = null;
let realtimeChannel = null;
let partnerCache = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  msgProfile = await renderShell({ activePage: "messages.html", eyebrowText: "Communication", titleText: "Messages" });
  if (!msgProfile) return;

  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const to = params.get("to");
  const project = params.get("project");
  if (to) {
    await openConversation(to, project || null);
  }
});

async function loadConversations() {
  const sb = getSupabase();
  const host = document.getElementById("conv-list");
  try {
    const { data: msgs, error } = await sb
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${msgProfile.id},receiver_id.eq.${msgProfile.id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const partners = new Map(); // partnerId -> { lastMsg, unread }
    for (const m of msgs) {
      const partnerId = m.sender_id === msgProfile.id ? m.receiver_id : m.sender_id;
      if (!partners.has(partnerId)) {
        partners.set(partnerId, { lastMsg: m, unread: 0 });
      }
      if (m.receiver_id === msgProfile.id && !m.is_read) {
        partners.get(partnerId).unread += 1;
      }
    }

    if (!partners.size) {
      host.innerHTML = `<div class="empty-state" style="padding:40px 16px;"><div class="icon">✉</div>No conversations yet.</div>`;
      return;
    }

    const ids = Array.from(partners.keys());
    const { data: profiles } = await sb.from("profiles").select("id, full_name, company_name").in("id", ids);
    profiles?.forEach((p) => partnerCache.set(p.id, p));

    host.innerHTML = Array.from(partners.entries())
      .map(([id, info]) => {
        const p = partnerCache.get(id) || {};
        return `
        <div class="conv-item ${activePartnerId === id ? "active" : ""}" data-partner="${id}">
          <img src="assets/images/avatar-placeholder.svg" style="width:40px;height:40px;border-radius:50%;" alt="" />
          <div style="flex:1;min-width:0;">
            <div class="flex justify-between"><span class="name">${escapeHtml(p.full_name || "Unknown")}</span>${info.unread ? `<span class="badge badge-info">${info.unread}</span>` : ""}</div>
            <div class="preview">${escapeHtml(info.lastMsg.message)}</div>
          </div>
        </div>`;
      })
      .join("");

    host.querySelectorAll(".conv-item").forEach((el) => {
      el.addEventListener("click", () => openConversation(el.dataset.partner, null));
    });
  } catch (err) {
    host.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

async function openConversation(partnerId, projectId) {
  activePartnerId = partnerId;
  activeProjectId = projectId;

  document.querySelectorAll(".conv-item").forEach((el) => el.classList.toggle("active", el.dataset.partner === partnerId));

  const sb = getSupabase();
  let partner = partnerCache.get(partnerId);
  if (!partner) {
    const { data } = await sb.from("profiles").select("id, full_name, company_name").eq("id", partnerId).single();
    partner = data;
    if (partner) partnerCache.set(partnerId, partner);
  }

  const pane = document.getElementById("chat-pane");
  pane.innerHTML = `
    <div class="chat-head">
      <img src="assets/images/avatar-placeholder.svg" style="width:36px;height:36px;border-radius:50%;" alt="" />
      <div><strong>${escapeHtml(partner?.full_name || "Unknown")}</strong><div class="text-muted" style="font-size:12px;">${escapeHtml(partner?.company_name || "")}</div></div>
    </div>
    <div class="chat-body" id="chat-body"><div class="loading-row"><div class="spinner"></div></div></div>
    <form class="chat-input-row" id="chat-form">
      <input type="text" id="chat-input" placeholder="Type a message…" autocomplete="off" />
      <button type="submit" class="btn btn-primary btn-sm">Send</button>
    </form>`;

  await loadMessages(partnerId);
  markMessagesRead(partnerId);
  subscribeToRealtime(partnerId);

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendMessage(partnerId, text);
  });
}

async function loadMessages(partnerId) {
  const sb = getSupabase();
  const body = document.getElementById("chat-body");
  try {
    const { data: msgs, error } = await sb
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${msgProfile.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${msgProfile.id})`)
      .order("created_at", { ascending: true });
    if (error) throw error;
    renderMessages(msgs);
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${friendlyError(err)}</div>`;
  }
}

function renderMessages(msgs) {
  const body = document.getElementById("chat-body");
  if (!body) return;
  if (!msgs.length) {
    body.innerHTML = `<div class="empty-state" style="margin:auto;">Say hello 👋</div>`;
    return;
  }
  body.innerHTML = msgs
    .map((m) => `
      <div class="msg-bubble ${m.sender_id === msgProfile.id ? "mine" : "theirs"}">
        ${escapeHtml(m.message)}
        <div class="msg-time">${timeAgo(m.created_at)}</div>
      </div>`)
    .join("");
  body.scrollTop = body.scrollHeight;
}

async function sendMessage(partnerId, text) {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("messages").insert({
      sender_id: msgProfile.id, receiver_id: partnerId,
      project_id: activeProjectId || null, message: text,
    });
    if (error) throw error;
    await loadMessages(partnerId);
  } catch (err) {
    toast(friendlyError(err, "Could not send message."), "error");
  }
}

async function markMessagesRead(partnerId) {
  const sb = getSupabase();
  await sb.from("messages").update({ is_read: true }).eq("sender_id", partnerId).eq("receiver_id", msgProfile.id).eq("is_read", false);
}

function subscribeToRealtime(partnerId) {
  const sb = getSupabase();
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  realtimeChannel = sb
    .channel(`messages-${msgProfile.id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${msgProfile.id}` },
      (payload) => {
        if (payload.new.sender_id === activePartnerId) {
          loadMessages(activePartnerId);
          markMessagesRead(activePartnerId);
        } else {
          loadConversations();
        }
      }
    )
    .subscribe();
}
