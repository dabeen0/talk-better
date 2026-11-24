/**
 * Dutch Pay Manager (더치페이 매니저)
 * - 외부 API / AI / 백엔드 서버 없는 순수 클라이언트 사이드 정산 애플리케이션
 * - 기능: 메뉴별 개별 참여자 선택, 그리디(Greedy) 알고리즘 기반 최소 송금 매칭, URL 쿼리 압축 공유
 */

const STORAGE_KEY = "dutch_pay_manager_state_v1";

// 애플리케이션 상태
let state = {
  title: "",
  account: "",
  members: [],   // 예: ["김민수", "이지은", "박현우"]
  expenses: [],  // 예: [{ id, name, amount, payer, participants: [] }]
  rounding: "exact"
};

// DOM 요소 참조
const el = {
  sharedBanner: document.getElementById("sharedBanner"),
  closeBannerBtn: document.getElementById("closeBannerBtn"),
  resetAllBtn: document.getElementById("resetAllBtn"),
  meetingTitle: document.getElementById("meetingTitle"),
  accountInfo: document.getElementById("accountInfo"),
  memberInput: document.getElementById("memberInput"),
  addMemberBtn: document.getElementById("addMemberBtn"),
  memberCount: document.getElementById("memberCount"),
  memberList: document.getElementById("memberList"),
  itemName: document.getElementById("itemName"),
  itemAmount: document.getElementById("itemAmount"),
  payerSelect: document.getElementById("payerSelect"),
  toggleAllParticipantsBtn: document.getElementById("toggleAllParticipantsBtn"),
  participantCheckboxes: document.getElementById("participantCheckboxes"),
  addExpenseBtn: document.getElementById("addExpenseBtn"),
  expenseCount: document.getElementById("expenseCount"),
  totalSpentDisplay: document.getElementById("totalSpentDisplay"),
  expenseList: document.getElementById("expenseList"),
  roundingOption: document.getElementById("roundingOption"),
  transferList: document.getElementById("transferList"),
  personalSummaryList: document.getElementById("personalSummaryList"),
  copyTextBtn: document.getElementById("copyTextBtn"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  toast: document.getElementById("toast")
};

// 초기화 실행
document.addEventListener("DOMContentLoaded", () => {
  loadInitialState();
  bindEvents();
  renderAll();
});

// URL 공유 데이터 또는 localStorage 불러오기
function loadInitialState() {
  const params = new URLSearchParams(window.location.search);
  const sharedData = params.get("data");

  if (sharedData) {
    try {
      const decoded = decodeStateFromUrl(sharedData);
      if (decoded && Array.isArray(decoded.members) && Array.isArray(decoded.expenses)) {
        state = {
          title: decoded.title || "",
          account: decoded.account || "",
          members: decoded.members,
          expenses: decoded.expenses,
          rounding: decoded.rounding || "exact"
        };
        el.sharedBanner.classList.remove("hidden");
        saveState();
        return;
      }
    } catch (e) {
      console.error("공유 링크 파싱 실패:", e);
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
      console.error("저장된 데이터 로드 실패:", e);
    }
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 이벤트 바인딩
function bindEvents() {
  el.closeBannerBtn.addEventListener("click", () => {
    el.sharedBanner.classList.add("hidden");
    window.history.replaceState({}, document.title, window.location.pathname);
  });

  el.resetAllBtn.addEventListener("click", () => {
    if (!confirm("모든 참여자와 결제 내역을 초기화할까요?")) return;
    state = { title: "", account: "", members: [], expenses: [], rounding: "exact" };
    localStorage.removeItem(STORAGE_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
    el.sharedBanner.classList.add("hidden");
    renderAll();
    showToast("모든 데이터가 초기화되었습니다.");
  });

  el.meetingTitle.addEventListener("input", (e) => {
    state.title = e.target.value;
    saveState();
  });

  el.accountInfo.addEventListener("input", (e) => {
    state.account = e.target.value;
    saveState();
  });

  el.addMemberBtn.addEventListener("click", handleAddMember);
  el.memberInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddMember();
    }
  });

  el.toggleAllParticipantsBtn.addEventListener("click", () => {
    const checkboxes = el.participantCheckboxes.querySelectorAll("input[type='checkbox']");
    if (checkboxes.length === 0) return;
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
      cb.closest(".check-pill").classList.toggle("checked", !allChecked);
    });
  });

  el.addExpenseBtn.addEventListener("click", handleAddExpense);

  el.roundingOption.addEventListener("change", (e) => {
    state.rounding = e.target.value;
    saveState();
    renderResults();
  });

  el.copyTextBtn.addEventListener("click", copyResultText);
  el.copyLinkBtn.addEventListener("click", copyShareLink);
}

// 참여자 추가
function handleAddMember() {
  const name = el.memberInput.value.trim();
  if (!name) {
    showToast("참여자 이름을 입력해 주세요.");
    return;
  }
  if (state.members.includes(name)) {
    showToast("이미 등록된 이름입니다.");
    return;
  }

  state.members.push(name);
  el.memberInput.value = "";
  saveState();
  renderAll();
}

// 참여자 삭제
function removeMember(name) {
  const isUsed = state.expenses.some(
    (exp) => exp.payer === name || exp.participants.includes(name)
  );
  if (isUsed) {
    const ok = confirm(
      `'${name}'님은 이미 결제 내역에 포함되어 있습니다. 삭제하면 관련 내역에서도 제외됩니다. 계속할까요?`
    );
    if (!ok) return;

    state.expenses = state.expenses
      .map((exp) => ({
        ...exp,
        payer: exp.payer === name ? (state.members.find((m) => m !== name) || "") : exp.payer,
        participants: exp.participants.filter((p) => p !== name)
      }))
      .filter((exp) => exp.payer && exp.participants.length > 0);
  }

  state.members = state.members.filter((m) => m !== name);
  saveState();
  renderAll();
}

// 결제 내역 추가
function handleAddExpense() {
  if (state.members.length === 0) {
    showToast("먼저 1단계에서 참여자를 추가해 주세요.");
    el.memberInput.focus();
    return;
  }

  const name = el.itemName.value.trim();
  const amount = Number(el.itemAmount.value);
  const payer = el.payerSelect.value;

  const checkedBoxes = el.participantCheckboxes.querySelectorAll("input[type='checkbox']:checked");
  const participants = Array.from(checkedBoxes).map((cb) => cb.value);

  if (!name) {
    showToast("항목 또는 메뉴명을 입력해 주세요.");
    el.itemName.focus();
    return;
  }
  if (!amount || amount <= 0) {
    showToast("올바른 금액을 입력해 주세요.");
    el.itemAmount.focus();
    return;
  }
  if (!payer) {
    showToast("결제한 사람을 선택해 주세요.");
    return;
  }
  if (participants.length === 0) {
    showToast("최소 1명 이상의 부담 인원을 선택해 주세요.");
    return;
  }

  state.expenses.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    amount,
    payer,
    participants
  });

  el.itemName.value = "";
  el.itemAmount.value = "";
  saveState();
  renderExpenses();
  renderResults();
  showToast("결제 내역이 추가되었습니다.");
}

// 결제 내역 삭제
function removeExpense(id) {
  state.expenses = state.expenses.filter((exp) => exp.id !== id);
  saveState();
  renderExpenses();
  renderResults();
}

// 전체 UI 렌더링
function renderAll() {
  el.meetingTitle.value = state.title;
  el.accountInfo.value = state.account;
  el.roundingOption.value = state.rounding;

  renderMembers();
  renderExpenseFormControls();
  renderExpenses();
  renderResults();
}

function renderMembers() {
  el.memberCount.textContent = `${state.members.length}명`;
  el.memberList.innerHTML = "";

  state.members.forEach((member) => {
    const chip = document.createElement("div");
    chip.className = "member-chip";
    chip.innerHTML = `
      <span>${escapeHtml(member)}</span>
      <button type="button" aria-label="${escapeHtml(member)} 삭제">✕</button>
    `;
    chip.querySelector("button").addEventListener("click", () => removeMember(member));
    el.memberList.appendChild(chip);
  });
}

function renderExpenseFormControls() {
  const prevPayer = el.payerSelect.value;
  el.payerSelect.innerHTML = "";

  if (state.members.length === 0) {
    el.payerSelect.innerHTML = `<option value="">참여자를 먼저 추가하세요</option>`;
    el.participantCheckboxes.innerHTML = `<p class="empty-hint">참여자를 등록하면 선택할 수 있습니다.</p>`;
    return;
  }

  state.members.forEach((member) => {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    if (member === prevPayer) option.selected = true;
    el.payerSelect.appendChild(option);
  });

  el.participantCheckboxes.innerHTML = "";
  state.members.forEach((member) => {
    const label = document.createElement("label");
    label.className = "check-pill checked";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(member)}" checked />
      <span>${escapeHtml(member)}</span>
    `;
    const checkbox = label.querySelector("input");
    checkbox.addEventListener("change", () => {
      label.classList.toggle("checked", checkbox.checked);
    });
    el.participantCheckboxes.appendChild(label);
  });
}

function renderExpenses() {
  el.expenseCount.textContent = state.expenses.length;
  const total = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
  el.totalSpentDisplay.textContent = formatCurrency(total);

  if (state.expenses.length === 0) {
    el.expenseList.innerHTML = `<p class="empty-state">아직 등록된 결제 내역이 없습니다.</p>`;
    return;
  }

  el.expenseList.innerHTML = "";
  state.expenses.forEach((exp) => {
    const perPerson = Math.round(exp.amount / exp.participants.length);
    const isAll = exp.participants.length === state.members.length;
    const participantLabel = isAll
      ? `전원 (${exp.participants.length}명)`
      : `${exp.participants.join(", ")} (${exp.participants.length}명)`;

    const item = document.createElement("div");
    item.className = "expense-item";
    item.innerHTML = `
      <div class="expense-info">
        <h4>${escapeHtml(exp.name)}</h4>
        <div class="expense-meta">
          <span class="payer-tag">결제: ${escapeHtml(exp.payer)}</span>
          <span>대상: ${escapeHtml(participantLabel)}</span>
          <span>(1인당 약 ${formatCurrency(perPerson)})</span>
        </div>
      </div>
      <div class="expense-right">
        <span class="expense-price">${formatCurrency(exp.amount)}</span>
        <button type="button" class="btn-delete-item">삭제</button>
      </div>
    `;
    item.querySelector(".btn-delete-item").addEventListener("click", () => removeExpense(exp.id));
    el.expenseList.appendChild(item);
  });
}

/**
 * 핵심 정산 엔진
 * 1. 개인별 선결제 금액(paid)과 메뉴별 부담 금액(owed) 계산
 * 2. 순수 차액(net = paid - owed) 도출 (+면 받을 돈, -면 보낼 돈)
 * 3. 그리디(Greedy) 매칭으로 최소 송금 횟수 경로 생성
 */
function calculateSettlement() {
  const stats = {};
  state.members.forEach((member) => {
    stats[member] = {
      name: member,
      paid: 0,
      owedRaw: 0,
      owed: 0,
      net: 0,
      menus: []
    };
  });

  state.expenses.forEach((exp) => {
    if (stats[exp.payer]) {
      stats[exp.payer].paid += exp.amount;
    }

    const share = exp.amount / exp.participants.length;
    exp.participants.forEach((person) => {
      if (stats[person]) {
        stats[person].owedRaw += share;
        stats[person].menus.push(`${exp.name}(${formatCurrency(Math.round(share))})`);
      }
    });
  });

  const totalAmount = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
  let sumOwed = 0;

  state.members.forEach((member) => {
    if (state.rounding === "ceil10") {
      stats[member].owed = Math.ceil(stats[member].owedRaw / 10) * 10;
    } else {
      stats[member].owed = Math.round(stats[member].owedRaw);
    }
    sumOwed += stats[member].owed;
  });

  const diff = totalAmount - sumOwed;
  if (diff !== 0 && state.members.length > 0) {
    const targetMember = [...state.members].sort((a, b) => stats[b].paid - stats[a].paid)[0];
    stats[targetMember].owed += diff;
  }

  state.members.forEach((member) => {
    stats[member].net = stats[member].paid - stats[member].owed;
  });

  const creditors = [];
  const debtors = [];

  Object.values(stats).forEach((s) => {
    if (s.net > 0) creditors.push({ name: s.name, amount: s.net });
    else if (s.net < 0) debtors.push({ name: s.name, amount: Math.abs(s.net) });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: transferAmount
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }

  return { stats, transfers, totalAmount };
}

function renderResults() {
  if (state.members.length === 0 || state.expenses.length === 0) {
    el.transferList.innerHTML = `<p class="empty-state">결제 내역을 추가하면 최소 송금 경로가 자동 계산됩니다.</p>`;
    el.personalSummaryList.innerHTML = `<p class="empty-state">참여자와 결제 내역을 입력해 주세요.</p>`;
    return;
  }

  const { stats, transfers } = calculateSettlement();

  if (transfers.length === 0) {
    el.transferList.innerHTML = `<p class="empty-state">모든 인원의 지출과 부담액이 일치하여 송금할 내역이 없습니다.</p>`;
  } else {
    el.transferList.innerHTML = "";
    transfers.forEach((t) => {
      const card = document.createElement("div");
      card.className = "transfer-card";
      card.innerHTML = `
        <div class="transfer-route">
          <span>${escapeHtml(t.from)}</span>
          <span class="arrow">→</span>
          <span>${escapeHtml(t.to)}</span>
        </div>
        <div class="transfer-amount">${formatCurrency(t.amount)}</div>
      `;
      el.transferList.appendChild(card);
    });
  }

  el.personalSummaryList.innerHTML = "";
  state.members.forEach((member) => {
    const s = stats[member];
    let badgeClass = "net-zero";
    let badgeText = "정산 완료 (0원)";

    if (s.net > 0) {
      badgeClass = "net-plus";
      badgeText = `+${formatCurrency(s.net)} 받기`;
    } else if (s.net < 0) {
      badgeClass = "net-minus";
      badgeText = `-${formatCurrency(Math.abs(s.net))} 보내기`;
    }

    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `
      <div class="summary-top">
        <span class="summary-name">${escapeHtml(s.name)}</span>
        <span class="net-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="summary-details">
        <span>선결제: ${formatCurrency(s.paid)}</span>
        <span>실제 부담액: ${formatCurrency(s.owed)}</span>
      </div>
      <div class="summary-menus">
        참여 항목: ${s.menus.length > 0 ? escapeHtml(s.menus.join(", ")) : "없음"}
      </div>
    `;
    el.personalSummaryList.appendChild(item);
  });
}

function copyResultText() {
  if (state.expenses.length === 0) {
    showToast("공유할 정산 내역이 없습니다.");
    return;
  }

  const { stats, transfers, totalAmount } = calculateSettlement();
  const title = state.title.trim() || "모임 더치페이 정산";

  let lines = [];
  lines.push(`🧾 [${title} 결과]`);
  lines.push(`총 지출 금액: ${formatCurrency(totalAmount)}`);
  if (state.account.trim()) {
    lines.push(`💳 정산 계좌: ${state.account.trim()}`);
  }
  lines.push("");
  lines.push("💸 [최소 송금 안내]");
  if (transfers.length === 0) {
    lines.push("- 추가 송금 내역 없음");
  } else {
    transfers.forEach((t) => {
      lines.push(`• ${t.from} → ${t.to} : ${formatCurrency(t.amount)}`);
    });
  }
  lines.push("");
  lines.push("📊 [개인별 부담 내역]");
  state.members.forEach((m) => {
    const s = stats[m];
    lines.push(`• ${m}: 부담 ${formatCurrency(s.owed)} (선결제 ${formatCurrency(s.paid)})`);
  });

  copyToClipboard(lines.join("\n"), "정산 내역 텍스트가 복사되었습니다!");
}

function copyShareLink() {
  if (state.members.length === 0) {
    showToast("공유할 데이터가 없습니다.");
    return;
  }

  const encoded = encodeStateToUrl(state);
  const shareUrl = `${window.location.origin}${window.location.pathname}?data=${encoded}`;
  copyToClipboard(shareUrl, "정산 결과 공유 링크가 복사되었습니다!");
}

function encodeStateToUrl(obj) {
  const jsonStr = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeStateFromUrl(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr);
}

function formatCurrency(num) {
  return `${Number(num).toLocaleString("ko-KR")}원`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function copyToClipboard(text, message) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast(message));
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showToast(message);
  }
}

let toastTimer;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2400);
}
