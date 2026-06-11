import{b as w,u as S,_ as m,c as E}from"./index-CVkWjX0D.js";
import{_ as T}from"./AppLayout.vue_vue_type_script_setup_true_lang-nL_Aklx0.js";
import{d as j,b as B,e as C,D as P,G as U,A as e,J as a,u as r,y as i,m as p,Q as A,a as v,c as _,B as c}from"./vendor-vue-DTN9MWCJ.js";
import{u as D}from"./vendor-i18n-BPHe7HMV.js";
import"./vendor-misc-BouSeZgX.js";
import"./LocaleSwitcher-DlMhNLEP.js";

const PURCHASE_PAGE_FALLBACK_STYLE=`
.purchase-page-shell {
  position: relative;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
}

.purchase-page-shell .purchase-page-inner {
  width: min(100%, 1180px);
  margin: 0 auto;
  box-sizing: border-box;
}

.purchase-page-shell .user {
  margin-bottom: 1rem;
  padding: 1rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  background: #f8fafc;
  word-break: break-word;
}

.purchase-page-shell .user .meta {
  margin-top: 0.3rem;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.6;
  word-break: break-all;
}

.purchase-page-shell .section-title {
  font-size: 1.05rem;
  font-weight: 650;
  color: #0f172a;
  margin: 0 0 0.75rem;
}

.purchase-page-shell .panel {
  max-width: 1180px;
}

.purchase-page-shell .grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.purchase-page-shell .card {
  border: 1px solid #e2e8f0;
  border-radius: 0.85rem;
  background: #fff;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}

.purchase-page-shell .card h3 {
  margin: 0;
  color: #0f172a;
  font-weight: 650;
}

.purchase-page-shell .card .desc {
  margin: 0.55rem 0;
  color: #475569;
  font-size: 0.875rem;
  line-height: 1.5;
}

.purchase-page-shell .card .price {
  font-weight: 700;
  font-size: 1rem;
  margin: 0.72rem 0;
  color: #1f2937;
}

.purchase-page-shell .card .btn.primary,
.purchase-page-shell .btn.primary {
  width: 100%;
  margin-top: 0.25rem;
}

.purchase-page-shell .meta-list {
  margin-top: 0.75rem;
  margin-bottom: 1rem;
}

.purchase-page-shell .meta-list div {
  font-size: 0.8125rem;
  color: #475569;
  margin-bottom: 0.25rem;
}

.purchase-page-shell .empty {
  color: #64748b;
  font-size: 0.875rem;
  margin: 0.9rem 0;
}

.purchase-page-shell .return-box {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
}

.purchase-page-shell .status-grid {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.purchase-page-shell .status-chip {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: #fff;
}

.purchase-page-shell .status-chip .label {
  display: block;
  color: #64748b;
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
}

.purchase-page-shell .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #0f172a;
}

.purchase-page-shell .mb-4,
.purchase-page-shell .mt-4 {
  width: 100%;
}

.purchase-page-shell select,
.purchase-page-shell input {
  border-color: #cbd5e1;
  border-radius: 0.75rem;
}

.purchase-page-shell select:focus,
.purchase-page-shell input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
  border-color: #2563eb;
}

.purchase-page-shell .overflow-x-auto {
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.purchase-page-shell table {
  min-width: 100%;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.purchase-page-shell table thead th {
  white-space: nowrap;
  vertical-align: middle;
}

.purchase-page-shell table th,
.purchase-page-shell table td {
  padding: 0.82rem 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.purchase-page-shell table tbody tr:last-child td {
  border-bottom: none;
}

.purchase-page-shell table tbody tr:hover td {
  background: #f8fafc;
}

.purchase-page-shell .btn.secondary {
  min-width: 78px;
}

.purchase-page-shell [disabled].btn.secondary {
  opacity: 0.55;
  cursor: not-allowed;
}

`;

function injectPurchasePageFallbackStyles(){
  if(typeof document === "undefined") return;
  if(document.getElementById("purchase-subscription-page-fallback")) return;
  const style = document.createElement("style");
  style.id = "purchase-subscription-page-fallback";
  style.textContent = PURCHASE_PAGE_FALLBACK_STYLE;
  document.head.appendChild(style);
}

const N={class:"console-page purchase-page-layout"},z={class:"console-title-panel"},I={class:"console-kicker"},L={class:"console-section-title"},M={class:"console-section-description"},O={class:"card flex-1 min-h-0 overflow-hidden purchase-page-shell"},W={key:0,class:"flex h-full items-center justify-center py-12"},$={key:1,class:"flex h-full items-center justify-center p-10 text-center"},F={class:"max-w-md"},G={class:"mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100"},J={class:"text-lg font-semibold text-gray-900"},Q={class:"mt-2 text-sm text-gray-500"},q=["innerHTML"];

const DEFAULT_ORDER_FILTERS={tradeStatus:"paid",fulfillmentStatus:"all",keyword:""};
const DEFAULT_PAGE_SIZE=20;

const te=j({__name:"PurchaseSubscriptionView",setup(){
  const{t}=D();
  injectPurchasePageFallbackStyles();
  const l=w();
  const f=S();
  const loading=v(!1);
  const pageTitle=v("");
  const pageSubtitle=v("");
  const contentHtml=v("");
  const contentRef=v(null);
  const orderFilters=v({...DEFAULT_ORDER_FILTERS});
  const orderCount=v(0);
  const orderTotal=v(0);
  const orderPage=v(1);
  const orderTotalPages=v(1);
  const qs=typeof window<"u"?new URLSearchParams(window.location.search):new URLSearchParams();
  const tokenFromQuery=qs.get("token")||"";
  const embeddedToken=tokenFromQuery||sessionStorage.getItem("pay_embedded_token")||localStorage.getItem("auth_token")||"";

  if(tokenFromQuery){
    sessionStorage.setItem("pay_embedded_token",tokenFromQuery);
    const clean=new URL(window.location.href);
    clean.searchParams.delete("token");
    window.history.replaceState({}, "", clean.toString());
  }

  const mode=_(()=>{
    const pathname=typeof window<"u"?window.location.pathname:"/purchase";
    if(pathname.startsWith("/admin/orders"))return"adminOrders";
    if(pathname.startsWith("/orders"))return"orders";
    if(pathname.startsWith("/purchase/return"))return"return";
    return"purchase";
  });

  const purchaseEnabled=_(()=>((l.cachedPublicSettings==null?void 0:l.cachedPublicSettings.purchase_subscription_enabled)??!1));

  function escapeHtml(value){
    return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function formatCny(amountCents){
    return "¥"+(Number(amountCents||0)/100).toFixed(2);
  }

  function formatDateTime(value){
    if(!value)return"-";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    return new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium",timeStyle:"short"}).format(date);
  }

  function formatOrderType(order){
    return order.skuType==="subscription"?"订阅":"余额";
  }

  function formatOrderSummary(order){
    if(order.skuType==="subscription"){
      return `Group ${escapeHtml(order.groupId)} / ${escapeHtml(order.validityDays)} 天`;
    }
    return `余额 +${escapeHtml(order.balanceAmount)}`;
  }

  function paymentBadge(order){
    return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${order.tradeStatus==="paid"?"bg-emerald-100 text-emerald-700":order.tradeStatus==="failed"||order.tradeStatus==="closed"||order.tradeStatus==="refunded"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}">${escapeHtml(order.tradeStatusLabel||order.tradeStatus||"未知")}</span>`;
  }

  function fulfillmentBadge(order){
    return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${order.fulfillmentStatus==="fulfilled"?"bg-emerald-100 text-emerald-700":order.fulfillmentStatus==="fulfillment_failed"?"bg-red-100 text-red-700":"bg-slate-100 text-slate-700"}">${escapeHtml(order.fulfillmentStatusLabel||order.fulfillmentStatus||"未知")}</span>`;
  }

  function renderUser(user){
    return '<div class="surface-tile mb-4">'+
      '<div class="font-medium text-slate-900">'+escapeHtml(user.email||"Unknown user")+'</div>'+
      '<div class="mt-1 text-sm text-slate-500">User ID: '+escapeHtml(user.id)+(user.username?' / '+escapeHtml(user.username):"")+'</div>'+
      '<div class="mt-2 text-sm text-slate-500">当前订单会直接发货到这个账号</div>'+
    '</div>';
  }

  function renderCatalogSection(title,items,type){
    if(!items.length){
      return '<section class="card overflow-hidden mt-4">'+
        '<div class="section-toolbar"><h3 class="text-base font-semibold text-slate-950">'+escapeHtml(title)+'</h3></div>'+
        '<div class="p-4"><div class="surface-tile p-6 text-sm text-slate-500">'+
          escapeHtml(title)+' 暂未配置。请先在支付服务的 catalog.json 里填写价格并启用 SKU。'+
        '</div></div>'+
      '</section>';
    }
    return '<section class="card overflow-hidden mt-4">'+
      '<div class="section-toolbar"><h3 class="text-base font-semibold text-slate-950">'+escapeHtml(title)+'</h3></div>'+
      '<div class="p-4"><div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">'+items.map((item)=>{
        const extra=type==="subscription"
          ? '<div class="mt-2 text-sm text-slate-500">Group ID：'+escapeHtml(item.groupId)+' · 有效期 '+escapeHtml(item.validityDays)+' 天</div>'
          : '<div class="mt-2 text-sm text-slate-500">到账余额：'+escapeHtml(item.balanceAmount)+'</div>';
        return '<article class="surface-tile card-hover">'+
          '<div class="space-y-1"><h3 class="font-semibold text-slate-950">'+escapeHtml(item.title)+'</h3>'+
          '<div class="text-sm text-slate-500">'+escapeHtml(item.description||"")+'</div></div>'+
          '<div class="mt-4 flex items-end justify-between gap-3"><div>'+
            '<div class="text-2xl font-semibold text-slate-950">'+formatCny(item.amountCents)+'</div>'+
          '</div>'+
          '<button class="btn btn-primary btn-sm" data-sku="'+escapeHtml(item.code)+'">立即支付</button>'+
          '</div>'+extra+
        '</article>';
      }).join("")+'</div></div>'+
    '</section>';
  }

  function renderOrderFilters(isAdmin){
    const tradeOptions=[
      ["paid","已支付"],
      ["pending","待支付"],
      ["closed","已关闭"],
      ["failed","支付失败"],
      ["refunded","已退款"],
      ["all","全部支付状态"],
    ];
    const fulfillmentOptions=[
      ["all","全部发放状态"],
      ["pending","待发放"],
      ["fulfilled","已发放"],
      ["fulfillment_failed","发放失败"],
    ];
    return '<section class="card overflow-hidden mb-4">'+
      '<div class="section-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">'+
        '<div>'+
          '<h3 class="text-base font-semibold text-slate-950">订单筛选</h3>'+
          '<p class="mt-1 text-sm text-slate-500">支付状态和发放状态可直接切换，关键字修改后请点“查询”。</p>'+
        '</div>'+
        '<div class="text-sm text-slate-500">本页 '+escapeHtml(orderCount.value)+' 条，共 '+escapeHtml(orderTotal.value)+' 条</div>'+
      '</div>'+
      '<div class="flex flex-wrap items-center gap-3 p-4">'+
        '<select data-order-filter="tradeStatus" class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">'+tradeOptions.map(([value,label])=>'<option value="'+value+'"'+(orderFilters.value.tradeStatus===value?' selected':'')+'>'+label+'</option>').join("")+'</select>'+
        '<select data-order-filter="fulfillmentStatus" class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">'+fulfillmentOptions.map(([value,label])=>'<option value="'+value+'"'+(orderFilters.value.fulfillmentStatus===value?' selected':'')+'>'+label+'</option>').join("")+'</select>'+
        '<input data-order-filter="keyword" class="min-w-[220px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none" placeholder="'+escapeHtml(isAdmin?"搜索订单号 / SKU / 邮箱 / 用户名":"搜索订单号 / SKU")+'" value="'+escapeHtml(orderFilters.value.keyword)+'" />'+
        '<button class="btn secondary btn-sm" data-apply-orders="1">查询</button>'+
        '<button class="btn secondary btn-sm" data-reset-orders="1">重置</button>'+
      '</div>'+
    '</section>';
  }

  function renderPagination(){
    if(orderTotal.value<=DEFAULT_PAGE_SIZE&&orderPage.value<=1){
      return "";
    }
    return '<div class="section-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">'+
      '<div class="text-sm text-slate-500">第 '+escapeHtml(orderPage.value)+' / '+escapeHtml(orderTotalPages.value)+' 页</div>'+
      '<div class="flex items-center gap-2">'+
        '<button class="btn secondary btn-sm" data-page-action="prev"'+(orderPage.value<=1?' disabled':'')+'>上一页</button>'+
        '<button class="btn secondary btn-sm" data-page-action="next"'+(orderPage.value>=orderTotalPages.value?' disabled':'')+'>下一页</button>'+
      '</div>'+
    '</div>';
  }

  function renderAdminRowActions(order){
    if(order.tradeStatus==="paid"){
      return '<span class="text-xs text-gray-400">已支付</span>';
    }
    if(order.tradeStatus==="closed"||order.tradeStatus==="refunded"){
      return '<span class="text-xs text-gray-400">不可修改</span>';
    }
    return '<div class="flex flex-wrap gap-2">'+
      '<button class="btn secondary btn-sm" data-admin-status="paid" data-order-id="'+escapeHtml(order.merchantOrderId)+'">标记已支付</button>'+
      '<button class="btn secondary btn-sm" data-admin-status="closed" data-order-id="'+escapeHtml(order.merchantOrderId)+'">标记关闭</button>'+
    '</div>';
  }

  function renderOrderRows(orders,isAdmin){
    if(!orders.length){
      return '<div class="p-4"><div class="surface-tile p-4 text-sm text-slate-500">当前筛选条件下没有订单。</div></div>';
    }
    return '<div class="overflow-x-auto">'+
      '<table class="min-w-[1180px] divide-y divide-slate-100">'+
      '<thead class="bg-slate-50"><tr class="text-left text-xs font-semibold text-slate-500">'+
      (isAdmin?'<th class="px-4 py-3">用户账号</th>':'')+
      '<th class="w-[180px] px-4 py-3">订单号</th>'+
      '<th class="px-4 py-3">类型</th>'+
      '<th class="px-4 py-3">SKU</th>'+
      '<th class="px-4 py-3">支付状态</th>'+
      '<th class="px-4 py-3">发放状态</th>'+
      '<th class="px-4 py-3">金额</th>'+
      '<th class="px-4 py-3">创建时间</th>'+
      '<th class="px-4 py-3">操作</th>'+
      '</tr></thead>'+
      '<tbody class="divide-y divide-gray-200">'+orders.map((order)=>{
        const actionButton=isAdmin
          ? renderAdminRowActions(order)
          : '<button class="btn secondary btn-sm" data-check-order="'+escapeHtml(order.merchantOrderId)+'">刷新状态</button>';
        return '<tr class="text-sm text-slate-700">'+
          (isAdmin?'<td class="px-4 py-4"><div class="font-medium">'+escapeHtml(order.userEmail||"-")+'</div><div class="mt-1 text-xs text-gray-500">用户名: '+escapeHtml(order.userUsername||"-")+'</div><div class="mt-1 text-xs text-gray-500">UID: '+escapeHtml(order.userId||"-")+'</div></td>':'')+
          '<td class="w-[180px] px-4 py-4 font-mono text-xs break-all">'+escapeHtml(order.merchantOrderId)+'</td>'+
          '<td class="px-4 py-4">'+escapeHtml(formatOrderType(order))+'</td>'+
          '<td class="px-4 py-4">'+escapeHtml(order.skuCode)+'<div class="mt-1 text-xs text-gray-500">'+formatOrderSummary(order)+'</div></td>'+
          '<td class="px-4 py-4">'+paymentBadge(order)+'</td>'+
          '<td class="px-4 py-4">'+fulfillmentBadge(order)+'</td>'+
          '<td class="px-4 py-4 font-semibold">'+escapeHtml(formatCny(order.amountCents))+'</td>'+
          '<td class="px-4 py-4 text-xs text-slate-500">'+escapeHtml(formatDateTime(order.createdAt))+'</td>'+
          '<td class="px-4 py-4">'+actionButton+'</td>'+
        '</tr>';
      }).join("")+'</tbody></table></div>';
  }

  function renderOrderPage(orders,isAdmin){
    contentHtml.value='<section class="card overflow-hidden">'+
      renderOrderFilters(isAdmin)+
      '<div class="p-1">'+renderOrderRows(orders,isAdmin)+'</div>'+
      renderPagination()+
    '</section>';
  }

  function renderReturnOrder(order){
    contentHtml.value='<section class="card overflow-hidden">'+
      '<div class="section-toolbar"><h3 class="text-base font-semibold text-slate-950">支付结果确认</h3><p class="mt-1 text-sm text-slate-500">浏览器回跳只代表支付流程返回，最终结果以服务端状态为准。</p></div>'+
      '<div class="p-4">'+
        '<div class="surface-tile">'+
          '<div class="font-medium text-slate-950">订单号</div>'+
          '<div class="mt-1 text-sm text-slate-500 font-mono">'+escapeHtml(order.merchantOrderId)+'</div>'+
          '<div class="mt-4 grid gap-3 sm:grid-cols-3" id="status-grid">'+
            '<article class="surface-tile"><span class="text-xs text-slate-500">支付状态</span><div class="mt-2 font-semibold text-slate-900">'+escapeHtml(order.tradeStatusLabel||order.tradeStatus||"未知")+'</div></article>'+
            '<article class="surface-tile"><span class="text-xs text-slate-500">发放状态</span><div class="mt-2 font-semibold text-slate-900">'+escapeHtml(order.fulfillmentStatusLabel||order.fulfillmentStatus||"未知")+'</div></article>'+
            '<article class="surface-tile"><span class="text-xs text-slate-500">支付流水</span><div class="mt-2 font-semibold text-slate-900">'+escapeHtml(order.platformOrderNo||"暂无")+'</div></article>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</section>';
  }

  async function api(path,options){
    const headers=Object.assign({"Content-Type":"application/json"},(options&&options.headers)||{});
    if(embeddedToken){
      headers.Authorization="Bearer "+embeddedToken;
    }
    const resp=await fetch(path,Object.assign({},options||{},{headers}));
    const text=await resp.text();
    let json={};
    try{json=text?JSON.parse(text):{};}catch{}
    if(!resp.ok){
      throw new Error(json.error||text||("HTTP "+resp.status));
    }
    return json;
  }

  async function submitOrder(skuCode){
    const result=await api("/pay-api/orders",{method:"POST",body:JSON.stringify({skuCode})});
    const host=document.createElement("div");
    host.style.display="none";
    host.innerHTML=result.formHtml;
    document.body.appendChild(host);
    const form=host.querySelector("form");
    if(!form)throw new Error("支付平台没有返回有效表单");
    form.submit();
  }

  async function checkOrder(merchantOrderId){
    const result=await api("/pay-api/orders/"+encodeURIComponent(merchantOrderId)+"/check",{method:"POST"});
    if(result.order.fulfillmentStatus==="fulfilled"){
      await loadOrders();
    }else{
      await loadOrders();
    }
  }

  async function updateAdminOrderStatus(merchantOrderId,tradeStatus){
    await api("/pay-api/admin/orders/"+encodeURIComponent(merchantOrderId)+"/status",{method:"POST",body:JSON.stringify({tradeStatus})});
    await loadOrders();
  }

  function buildOrderQuery(){
    const params=new URLSearchParams();
    params.set("page",String(orderPage.value));
    params.set("pageSize",String(DEFAULT_PAGE_SIZE));
    if(orderFilters.value.tradeStatus&&orderFilters.value.tradeStatus!=="all"){
      params.set("tradeStatus",orderFilters.value.tradeStatus);
    }
    if(orderFilters.value.fulfillmentStatus&&orderFilters.value.fulfillmentStatus!=="all"){
      params.set("fulfillmentStatus",orderFilters.value.fulfillmentStatus);
    }
    if(orderFilters.value.keyword.trim()){
      params.set("keyword",orderFilters.value.keyword.trim());
    }
    return params.toString();
  }

  async function loadPurchase(){
    pageTitle.value="购买套餐";
    pageSubtitle.value="通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。";
    const session=await api("/pay-api/session");
    const catalog=await api("/pay-api/catalog");
    contentHtml.value='<div class="space-y-4">'+renderUser(session.user)+renderCatalogSection("订阅套餐",catalog.subscriptions||[],"subscription")+renderCatalogSection("余额充值",catalog.balancePacks||[],"balance")+'</div>';
  }

  async function loadReturn(){
    pageTitle.value="支付结果确认";
    pageSubtitle.value="浏览器回跳只代表支付流程返回，最终结果以服务端查单、支付状态和发放状态为准。";
    const merchantOrderId=qs.get("merchantOrderId");
    if(!merchantOrderId){
      throw new Error("缺少 merchantOrderId，无法确认订单。");
    }
    const result=await api("/pay-api/orders/"+encodeURIComponent(merchantOrderId)+"/check",{method:"POST"});
    renderReturnOrder(result.order);
  }

  async function loadOrders(){
    const isAdmin=mode.value==="adminOrders";
    pageTitle.value="订单管理";
    pageSubtitle.value=isAdmin?"查看全部订单，并按支付状态、发放状态或关键字筛选。":"查看已支付订单，并按状态或关键字筛选。";
    const endpoint=isAdmin?"/pay-api/admin/orders":"/pay-api/orders";
    const result=await api(endpoint+"?"+buildOrderQuery());
    orderCount.value=Array.isArray(result.orders)?result.orders.length:0;
    orderTotal.value=Number(result.total||0);
    orderPage.value=Number(result.page||1);
    orderTotalPages.value=Math.max(1,Number(result.totalPages||1));
    renderOrderPage(result.orders||[],isAdmin);
  }

  function resetOrderFilters(){
    orderFilters.value={...DEFAULT_ORDER_FILTERS};
    orderPage.value=1;
  }

  function syncOrderFiltersFromDom(){
    const root=contentRef.value;
    if(!root)return;
    const nextFilters={...orderFilters.value};
    root.querySelectorAll("[data-order-filter]").forEach((element)=>{
      const field=element.getAttribute("data-order-filter");
      if(!field)return;
      if(element instanceof HTMLSelectElement||element instanceof HTMLInputElement){
        nextFilters[field]=element.value;
      }
    });
    orderFilters.value=nextFilters;
  }

  function bindDelegates(){
    const root=contentRef.value;
    if(!root)return;
    root.onclick=async(event)=>{
      const target=event.target instanceof Element?event.target.closest("[data-sku],[data-check-order],[data-apply-orders],[data-reset-orders],[data-page-action],[data-admin-status]"):null;
      if(!target)return;
      event.preventDefault();
      if(target.hasAttribute("data-sku")){
        target.setAttribute("disabled","disabled");
        try{
          await submitOrder(target.getAttribute("data-sku"));
        }finally{
          target.removeAttribute("disabled");
        }
        return;
      }
      if(target.hasAttribute("data-check-order")){
        target.setAttribute("disabled","disabled");
        try{
          await checkOrder(target.getAttribute("data-check-order"));
        }finally{
          target.removeAttribute("disabled");
        }
        return;
      }
      if(target.hasAttribute("data-reset-orders")){
        resetOrderFilters();
        await loadOrders();
        return;
      }
      if(target.hasAttribute("data-apply-orders")){
        syncOrderFiltersFromDom();
        orderPage.value=1;
        await loadOrders();
        return;
      }
      if(target.hasAttribute("data-page-action")){
        const action=target.getAttribute("data-page-action");
        if(action==="prev"&&orderPage.value>1){
          orderPage.value-=1;
          await loadOrders();
        }
        if(action==="next"&&orderPage.value<orderTotalPages.value){
          orderPage.value+=1;
          await loadOrders();
        }
        return;
      }
      if(target.hasAttribute("data-admin-status")){
        target.setAttribute("disabled","disabled");
        try{
          await updateAdminOrderStatus(target.getAttribute("data-order-id"),target.getAttribute("data-admin-status"));
        }finally{
          target.removeAttribute("disabled");
        }
        return;
      }
      await loadOrders();
    };
    root.onchange=async(event)=>{
      const target=event.target instanceof Element?event.target:null;
      if(!(target instanceof HTMLSelectElement||target instanceof HTMLInputElement))return;
      const field=target.getAttribute("data-order-filter");
      if(!field)return;
      orderFilters.value={...orderFilters.value,[field]:target.value};
      orderPage.value=1;
      if(target instanceof HTMLSelectElement){
        await loadOrders();
      }
    };
    root.onkeydown=async(event)=>{
      const target=event.target instanceof Element?event.target:null;
      if(!(target instanceof HTMLInputElement))return;
      if(target.getAttribute("data-order-filter")!=="keyword")return;
      if(event.key!=="Enter")return;
      orderFilters.value={...orderFilters.value,keyword:target.value};
      orderPage.value=1;
      await loadOrders();
    };
  }

  async function renderCurrent(){
    if(mode.value==="purchase"){
      if(!purchaseEnabled.value){
        pageTitle.value="购买套餐";
        pageSubtitle.value="通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。";
        contentHtml.value="";
        return;
      }
      await loadPurchase();
      return;
    }
    if(mode.value==="return"){
      await loadReturn();
      return;
    }
    await loadOrders();
  }

  B(async()=>{
    if(!embeddedToken&&mode.value!=="return"){
      throw new Error("缺少登录 token，无法识别当前登录用户。");
    }
    if(mode.value==="purchase"&&!l.publicSettingsLoaded){
      loading.value=!0;
      try{
        await l.fetchPublicSettings();
      }finally{
        loading.value=!1;
      }
    }
    loading.value=!0;
    try{
      await renderCurrent();
    }finally{
      loading.value=!1;
    }
    await A();
    bindDelegates();
  });

  C(()=>{
    if(contentRef.value){
      contentRef.value.onclick=null;
      contentRef.value.onchange=null;
      contentRef.value.onkeydown=null;
    }
  });

        return(s,n)=>(c(),P(T,null,{default:U(()=>[
    e("div",N,[
      e("div",z,[
        e("p",I,a(r(t)("nav.myAccount")),1),
        e("h1",L,a(pageTitle.value||r(t)("purchase.title")),1),
        e("p",M,a(pageSubtitle.value||r(t)("purchase.description")),1)
      ]),
      e("div",O,[
        loading.value?(c(),i("div",W,n[0]||(n[0]=[
          e("div",{class:"h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"},null,-1)
        ]))):(contentHtml.value?(c(),i("div",{key:1,ref_key:"contentRef",ref:contentRef,class:"purchase-page-inner h-full overflow-y-auto overflow-x-hidden p-4 md:p-6",innerHTML:contentHtml.value},null,8,q)):(c(),i("div",$,[
          e("div",F,[
            e("div",G,[p(m,{name:"creditCard",size:"lg",class:"text-gray-400"})]),
            e("h3",J,a(r(t)("purchase.notEnabledTitle")),1),
            e("p",Q,a(r(t)("purchase.notEnabledDesc")),1)
          ])
        ])))
      ])
    ])
  ]),_:1}));
}});

const he=E(te,[["__scopeId","data-v-55624243"]]);
export{he as default};
