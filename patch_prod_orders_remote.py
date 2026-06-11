from pathlib import Path
import textwrap


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new, 1))
        return
    if new in text:
        return
    raise SystemExit(f"Missing pattern in {path}: {old}")


replace_once(
    "/var/www/zhisales-site/assets/zh-dtbEtbBh.js",
    'mySubscriptions:"我的订阅",buySubscription:"充值/订阅"',
    'mySubscriptions:"我的订阅",orders:"订单管理",buySubscription:"充值/订阅"',
)
replace_once(
    "/var/www/zhisales-site/assets/en-Du6GviAa.js",
    'mySubscriptions:"My Subscriptions",buySubscription:"Recharge / Subscription"',
    'mySubscriptions:"My Subscriptions",orders:"Orders",buySubscription:"Recharge / Subscription"',
)
replace_once(
    "/var/www/zhisales-site/assets/AppLayout.vue_vue_type_script_setup_true_lang-nL_Aklx0.js",
    '{path:"/subscriptions",label:t("nav.mySubscriptions"),icon:p,hideInSimpleMode:!0},...(N=m.cachedPublicSettings)!=null&&N.sora_client_enabled?[{path:"/sora",label:t("nav.sora"),icon:d}]:[],...(P=m.cachedPublicSettings)!=null&&P.purchase_subscription_enabled?[{path:"/purchase",label:t("nav.buySubscription"),icon:l,hideInSimpleMode:!0}]:[],',
    '{path:"/subscriptions",label:t("nav.mySubscriptions"),icon:p,hideInSimpleMode:!0},{path:"/orders",label:t("nav.orders"),icon:l},...(N=m.cachedPublicSettings)!=null&&N.sora_client_enabled?[{path:"/sora",label:t("nav.sora"),icon:d}]:[],...(P=m.cachedPublicSettings)!=null&&P.purchase_subscription_enabled?[{path:"/purchase",label:t("nav.buySubscription"),icon:l,hideInSimpleMode:!0}]:[],',
)
replace_once(
    "/var/www/zhisales-site/assets/AppLayout.vue_vue_type_script_setup_true_lang-nL_Aklx0.js",
    '{path:"/admin/subscriptions",label:t("nav.subscriptions"),icon:p,hideInSimpleMode:!0},{path:"/admin/accounts",label:t("nav.accounts"),icon:$}',
    '{path:"/admin/subscriptions",label:t("nav.subscriptions"),icon:p,hideInSimpleMode:!0},{path:"/admin/orders",label:t("nav.orders"),icon:l},{path:"/admin/accounts",label:t("nav.accounts"),icon:$}',
)

component_code = textwrap.dedent(
    """
    import{b as w,u as S,_ as m,c as E}from"./index-CVkWjX0D.js";
    import{_ as T}from"./AppLayout.vue_vue_type_script_setup_true_lang-nL_Aklx0.js";
    import{d as x,b as V}from"./embedded-url-Cu84NKhc.js";
    import{d as j,b as B,e as C,D as P,G as U,A as e,J as a,u as r,y as i,m as p,Q as A,a as v,c as _,B as c}from"./vendor-vue-DTN9MWCJ.js";
    import{u as D}from"./vendor-i18n-BPHe7HMV.js";
    import"./vendor-misc-BouSeZgX.js";
    /* empty css                                                                  */
    import"./LocaleSwitcher-DlMhNLEP.js";
    /* empty css                                                                       */
    const N={class:"console-page purchase-page-layout"},z={class:"console-title-panel"},I={class:"console-kicker"},L={class:"console-section-title"},M={class:"console-section-description"},O={class:"card flex-1 min-h-0 overflow-hidden"},W={key:0,class:"flex h-full items-center justify-center py-12"},$={key:1,class:"flex h-full items-center justify-center p-10 text-center"},F={class:"max-w-md"},G={class:"mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700"},J={class:"text-lg font-semibold text-gray-900 dark:text-white"},Q={class:"mt-2 text-sm text-gray-500 dark:text-dark-400"},q={key:2,class:"flex h-full items-center justify-center p-10 text-center"},H={class:"max-w-md"},K={class:"mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700"},R={class:"text-lg font-semibold text-gray-900 dark:text-white"},X={class:"mt-2 text-sm text-gray-500 dark:text-dark-400"},Y={key:3,class:"purchase-embed-shell"},Z=["href"],ee=["innerHTML"];
    const te=j({__name:"PurchaseSubscriptionView",setup(se){
      const{t,locale:g}=D();
      const l=w();
      const f=S();
      const d=v(!1);
      const u=v("light");
      const statusKind=v("");
      const statusText=v("");
      const pageTitle=v("");
      const pageSubtitle=v("");
      const contentHtml=v("");
      const contentRef=v(null);
      let o=null;
      let themeObserver=null;
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
      const purchaseUrl=_(()=>{
        var s,b;
        const pathname=((s=l.cachedPublicSettings==null?void 0:l.cachedPublicSettings.purchase_subscription_url)||"").trim();
        return V(pathname,(b=f.user)==null?void 0:b.id,f.token,u.value,g.value);
      });
      const purchaseUrlIsExternal=_(()=>{
        const s=purchaseUrl.value;
        return s.startsWith("http://")||s.startsWith("https://");
      });
      const currentUserId=_(()=>Number(((f.user==null?void 0:f.user.id)||0)));

      function escapeHtml(value){
        return String(value??"")
          .replace(/&/g,"&amp;")
          .replace(/</g,"&lt;")
          .replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;")
          .replace(/'/g,"&#39;");
      }
      function formatCny(amountCents){
        return "¥" + (Number(amountCents||0)/100).toFixed(2);
      }
      function formatDateTime(value){
        if(!value)return"-";
        const date=new Date(value);
        if(Number.isNaN(date.getTime()))return String(value);
        return new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium",timeStyle:"short"}).format(date);
      }
      function setStatus(kind,message){
        statusKind.value=kind||"";
        statusText.value=message||"";
      }
      function formatOrderType(order){
        return order.skuType==="subscription"?"订阅":"余额";
      }
      function formatOrderSummary(order){
        const label=order.skuType==="subscription"?"订阅":"余额";
        const extra=order.skuType==="subscription"
          ? `Group ${escapeHtml(order.groupId)} / ${escapeHtml(order.validityDays)} 天`
          : `余额 +${escapeHtml(order.balanceAmount)}`;
        return `${label} · ${escapeHtml(order.skuCode)} · ${extra}`;
      }
      function paymentBadge(order){
        return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${order.tradeStatus==="paid"?"bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300":order.tradeStatus==="failed"||order.tradeStatus==="closed"||order.tradeStatus==="refunded"?"bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300":"bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}">${escapeHtml(order.tradeStatusLabel||order.tradeStatus||"未知")}</span>`;
      }
      function fulfillmentBadge(order){
        return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${order.fulfillmentStatus==="fulfilled"?"bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300":order.fulfillmentStatus==="fulfillment_failed"?"bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300":"bg-slate-100 text-slate-700 dark:bg-dark-700 dark:text-dark-200"}">${escapeHtml(order.fulfillmentStatusLabel||order.fulfillmentStatus||"未知")}</span>`;
      }
      function renderUser(user){
        return '<div class="user">' +
          '<div><div><strong>' + escapeHtml(user.email || 'Unknown user') + '</strong></div>' +
          '<div class="meta">User ID: ' + escapeHtml(user.id) + (user.username ? ' / ' + escapeHtml(user.username) : '') + '</div></div>' +
          '<div class="meta">当前订单会直接发货到这个账号</div>' +
        '</div>';
      }
      function renderCatalogSection(title,items,type){
        if(!items.length){
          return '<div class="empty">' + escapeHtml(title) + ' 暂未配置。请先在支付服务的 catalog.json 里填写价格并启用 SKU。</div>';
        }
        return '<div class="mt-6"><div class="section-title">' + escapeHtml(title) + '</div><div class="grid">' + items.map(function(item){
          const extra=type==='subscription'
            ? '<div class="meta-list"><div>Group ID: ' + escapeHtml(item.groupId) + '</div><div>有效期: ' + escapeHtml(item.validityDays) + ' 天</div></div>'
            : '<div class="meta-list"><div>到账余额: ' + escapeHtml(item.balanceAmount) + '</div></div>';
          return '<div class="card">' +
            '<h3>' + escapeHtml(item.title) + '</h3>' +
            '<div class="desc">' + escapeHtml(item.description || '') + '</div>' +
            '<div class="price">' + formatCny(item.amountCents) + '</div>' +
            extra +
            '<button class="btn primary" data-sku="' + escapeHtml(item.code) + '">立即支付</button>' +
          '</div>';
        }).join('') + '</div></div>';
      }
      function renderOrderRows(orders,allowCheck){
        if(!orders.length){
          return '<div class="empty">当前没有找到订单。</div>';
        }
        return '<div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">' +
          '<table class="min-w-full divide-y divide-gray-200 dark:divide-white/10">' +
          '<thead class="bg-gray-50 dark:bg-white/5"><tr class="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-300">' +
          '<th class="px-4 py-3">订单号</th>' +
          '<th class="px-4 py-3">类型</th>' +
          '<th class="px-4 py-3">SKU</th>' +
          '<th class="px-4 py-3">支付状态</th>' +
          '<th class="px-4 py-3">发放状态</th>' +
          '<th class="px-4 py-3">金额</th>' +
          '<th class="px-4 py-3">创建时间</th>' +
          '<th class="px-4 py-3">操作</th>' +
          '</tr></thead>' +
          '<tbody class="divide-y divide-gray-200 dark:divide-white/10">' + orders.map(function(order){
            const actionButton = allowCheck
              ? '<button class="btn secondary btn-sm" data-check-order="' + escapeHtml(order.merchantOrderId) + '">刷新状态</button>'
              : '<button class="btn secondary btn-sm" data-refresh-orders="1">刷新列表</button>';
            return '<tr class="text-sm text-gray-700 dark:text-dark-200">' +
              '<td class="px-4 py-4 font-mono text-xs break-all">' + escapeHtml(order.merchantOrderId) + '</td>' +
              '<td class="px-4 py-4">' + escapeHtml(formatOrderType(order)) + '</td>' +
              '<td class="px-4 py-4">' + escapeHtml(order.skuCode) + '<div class="mt-1 text-xs text-gray-500 dark:text-dark-400">' + formatOrderSummary(order) + '</div></td>' +
              '<td class="px-4 py-4">' + paymentBadge(order) + '</td>' +
              '<td class="px-4 py-4">' + fulfillmentBadge(order) + '</td>' +
              '<td class="px-4 py-4 font-semibold">' + escapeHtml(formatCny(order.amountCents)) + '</td>' +
              '<td class="px-4 py-4 text-xs text-gray-500 dark:text-dark-400">' + escapeHtml(formatDateTime(order.createdAt)) + '</td>' +
              '<td class="px-4 py-4">' + actionButton + '</td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>';
      }
      function renderOrderPage(orders,querySupported,isAdmin){
        const summary = '<div class="user"><div><strong>' + escapeHtml(isAdmin ? '管理员订单视图' : '我的订单') + '</strong><div class="meta">' + escapeHtml(isAdmin ? '管理员可查看全部订单数据' : '仅显示当前登录账号的订单') + '</div></div><div class="meta">' + (querySupported ? '支付查询已启用' : '支付查询暂不可用') + '</div></div>';
        const controls = '<div class="flex flex-wrap items-center gap-3"><button class="btn secondary" data-refresh-orders="1">刷新列表</button><div class="text-sm text-gray-500 dark:text-dark-400">显示 ' + escapeHtml(orders.length) + ' 条订单</div></div>';
        contentHtml.value = summary + '<div class="mt-4">' + controls + '</div><div class="mt-6">' + renderOrderRows(orders,!isAdmin) + '</div>';
      }
      function renderReturnOrder(order){
        contentHtml.value = '<div class="return-box user"><div><strong>订单号</strong><div class="meta mono">' + escapeHtml(order.merchantOrderId) + '</div></div><div class="status-grid" id="status-grid"><div class="status-chip"><span class="label">支付状态</span><strong>' + escapeHtml(order.tradeStatusLabel || order.tradeStatus || '未知') + '</strong></div><div class="status-chip"><span class="label">发放状态</span><strong>' + escapeHtml(order.fulfillmentStatusLabel || order.fulfillmentStatus || '未知') + '</strong></div><div class="status-chip"><span class="label">支付流水</span><strong>' + escapeHtml(order.platformOrderNo || '暂无') + '</strong></div></div></div>';
      }
      function bindDelegates(){
        const root=contentRef.value;
        if(!root)return;
        root.onclick=async function(event){
          const target=event.target instanceof Element ? event.target.closest('[data-sku],[data-check-order],[data-refresh-orders]') : null;
          if(!target)return;
          event.preventDefault();
          const sku=target.getAttribute('data-sku');
          const checkOrderId=target.getAttribute('data-check-order');
          const refreshOrders=target.getAttribute('data-refresh-orders');
          if(sku){
            try{
              target.setAttribute('disabled','disabled');
              await submitOrder(sku);
            }catch(error){
              setStatus('err', error.message || '创建支付订单失败');
              target.removeAttribute('disabled');
            }
            return;
          }
          if(checkOrderId){
            try{
              target.setAttribute('disabled','disabled');
              await checkOrder(checkOrderId);
            }catch(error){
              setStatus('err', error.message || '刷新订单失败');
              target.removeAttribute('disabled');
            }
            return;
          }
          if(refreshOrders){
            await loadOrders();
          }
        };
      }
      async function api(path, options){
        const headers=Object.assign({'Content-Type':'application/json'},(options&&options.headers)||{});
        if(embeddedToken){
          headers.Authorization='Bearer ' + embeddedToken;
        }
        const resp=await fetch(path,Object.assign({},options||{},{headers}));
        const text=await resp.text();
        let json={};
        try{json=text?JSON.parse(text):{};}catch(_){ }
        if(!resp.ok){
          throw new Error(json.error || text || ('HTTP ' + resp.status));
        }
        return json;
      }
      async function submitOrder(skuCode){
        setStatus('', '正在创建支付订单...');
        const result=await api('/pay-api/orders',{method:'POST',body:JSON.stringify({skuCode:skuCode})});
        setStatus('ok', '订单已创建，正在跳转到支付宝...');
        const host=document.createElement('div');
        host.style.display='none';
        host.innerHTML=result.formHtml;
        document.body.appendChild(host);
        const form=host.querySelector('form');
        if(!form)throw new Error('支付平台没有返回有效表单');
        form.submit();
      }
      async function checkOrder(merchantOrderId){
        setStatus('', '正在确认支付状态...');
        const result=await api('/pay-api/orders/' + encodeURIComponent(merchantOrderId) + '/check',{method:'POST'});
        const order=result.order;
        if(result.querySupported===false){
          setStatus('warn', '支付订单已记录，但当前支付查询暂不可用。请稍后重试或联系管理员处理。');
        }else if(order.fulfillmentStatus==='fulfilled'){
          setStatus('ok', '支付已确认，订阅/余额已成功发放。');
        }else if(order.fulfillmentStatus==='fulfillment_failed'){
          setStatus('err', '支付已确认，但发放失败：' + (order.errorMessage || '未知错误'));
        }else if(order.tradeStatus==='failed' || order.tradeStatus==='closed' || order.tradeStatus==='refunded'){
          setStatus('err', '订单当前支付状态为 ' + (order.tradeStatusLabel || order.tradeStatus) + '，未执行发放。');
        }else{
          setStatus('warn', '订单仍在确认中，已支付后会自动进入发放流程，请稍后刷新或重试。');
        }
        return order;
      }
      async function loadPurchase(){
        pageTitle.value='购买套餐';
        pageSubtitle.value='通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。';
        const session=await api('/pay-api/session');
        const catalog=await api('/pay-api/catalog');
        setStatus('ok', '当前登录用户已确认，可以开始购买。');
        contentHtml.value='<div class="panel">' + renderUser(session.user) + renderCatalogSection('订阅套餐', catalog.subscriptions || [], 'subscription') + renderCatalogSection('余额充值', catalog.balancePacks || [], 'balance') + '</div>';
      }
      async function loadReturn(){
        pageTitle.value='支付结果确认';
        pageSubtitle.value='浏览器回跳只代表支付流程返回，最终结果以服务端查单、支付状态和发放状态为准。';
        const merchantOrderId=qs.get('merchantOrderId');
        if(!merchantOrderId){
          setStatus('err', '缺少 merchantOrderId，无法确认订单。');
          contentHtml.value='';
          return;
        }
        setStatus('', '正在确认支付状态...');
        const result=await api('/pay-api/orders/' + encodeURIComponent(merchantOrderId) + '/check',{method:'POST'});
        const order=result.order;
        renderReturnOrder(order);
        if(result.querySupported===false){
          setStatus('warn', '支付订单已记录，但当前支付查询暂不可用。请稍后重试或联系管理员处理。');
          return;
        }
        if(order.fulfillmentStatus==='fulfilled'){
          setStatus('ok', '支付已确认，订阅/余额已成功发放。');
          return;
        }
        if(order.fulfillmentStatus==='fulfillment_failed'){
          setStatus('err', '支付已确认，但发放失败：' + (order.errorMessage || '未知错误'));
          return;
        }
        if(order.tradeStatus==='failed' || order.tradeStatus==='closed' || order.tradeStatus==='refunded'){
          setStatus('err', '订单当前支付状态为 ' + (order.tradeStatusLabel || order.tradeStatus) + '，未执行发放。');
          return;
        }
        setStatus('warn', '订单仍在确认中，已支付后会自动进入发放流程，请稍后刷新或重试。');
      }
      async function loadOrders(){
        const isAdmin=mode.value==='adminOrders';
        pageTitle.value='订单管理';
        pageSubtitle.value=isAdmin ? '查看全部订单、支付状态和发放状态。' : '查看支付记录、支付状态和发放状态。';
        setStatus('', '正在加载订单列表...');
        const endpoint=isAdmin ? '/pay-api/admin/orders' : '/pay-api/orders';
        const result=await api(endpoint);
        renderOrderPage(result.orders || [], result.querySupported !== false, isAdmin);
        setStatus('ok', isAdmin ? '管理员订单列表已加载。' : '订单列表已加载。');
      }
      async function renderCurrent(){
        const current=mode.value;
        if(current==='purchase'){
          pageTitle.value='购买套餐';
          pageSubtitle.value='通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。';
          if(!purchaseEnabled.value){
            setStatus('warn', '当前站点未开启购买功能。');
            contentHtml.value='<div class="flex h-full items-center justify-center p-10 text-center"><div class="max-w-md"><div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700"><svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-1.5A9.75 9.75 0 1 1 2.25 12a9.75 9.75 0 0 1 19.5 0Z"/></svg></div><h3 class="text-lg font-semibold text-gray-900 dark:text-white">' + escapeHtml(r(t)('purchase.notEnabledTitle')) + '</h3><p class="mt-2 text-sm text-gray-500 dark:text-dark-400">' + escapeHtml(r(t)('purchase.notEnabledDesc')) + '</p></div></div>';
            return;
          }
          const session=await api('/pay-api/session');
          const catalog=await api('/pay-api/catalog');
          setStatus('ok', '当前登录用户已确认，可以开始购买。');
          contentHtml.value='<div class="panel">' + renderUser(session.user) + renderCatalogSection('订阅套餐', catalog.subscriptions || [], 'subscription') + renderCatalogSection('余额充值', catalog.balancePacks || [], 'balance') + '</div>';
          return;
        }
        if(current==='return'){
          await loadReturn();
          return;
        }
        await loadOrders();
      }
      function onThemeChange(){
        u.value=x();
      }
      B(async()=>{
        u.value=x();
        if(typeof document<"u"){
          themeObserver=new MutationObserver(onThemeChange);
          themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]});
        }
        if(!embeddedToken && mode.value!=='return'){
          setStatus('err', '缺少登录 token，无法识别当前登录用户。');
          return;
        }
        if(mode.value==='purchase' && !l.publicSettingsLoaded){
          d.value=!0;
          try{await l.fetchPublicSettings();}finally{d.value=!1;}
        }
        await renderCurrent();
        bindDelegates();
      });
      C(()=>{
        if(themeObserver){
          themeObserver.disconnect();
          themeObserver=null;
        }
        if(contentRef.value){
          contentRef.value.onclick=null;
        }
      });
      return (s,n)=>(c(),P(T,null,{default:U(()=>[e("div",N,[e("div",z,[e("p",I,a(r(t)("nav.myAccount")),1),e("h1",L,a(pageTitle.value || r(t)("purchase.title")),1),e("p",M,a(pageSubtitle.value || r(t)("purchase.description")),1)]),e("div",O,[d.value?(c(),i("div",W,[...n[0]||(n[0]=[e("div",{class:"h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"},null,-1)])])):contentHtml.value?(c(),i("div",{key:1,ref_key:"contentRef",ref:contentRef,class:"purchase-embed-shell",innerHTML:contentHtml.value},null,8,ee)):(c(),i("div",$,[e("div",F,[e("div",K,[p(m,{name:"link",size:"lg",class:"text-gray-400"})]),e("h3",R,a(r(t)("purchase.notConfiguredTitle")),1),e("p",X,a(r(t)("purchase.notConfiguredDesc")),1)])]))])])]),_:1}));
    }}),he=E(te,[["__scopeId","data-v-55624243"]]);export{he as default};
    """
)

Path("/var/www/zhisales-site/assets/PurchaseSubscriptionView-DDDC2WHV.js").write_text(component_code)

index_path = Path("/var/www/zhisales-site/assets/index-CVkWjX0D.js")
text = index_path.read_text()
old_purchase = '{path:"/purchase",name:"PurchaseSubscription",component:()=>w(()=>import("./PurchaseSubscriptionView-DDDC2WHV.js"),__vite__mapDeps([70,40,1,6,7,3,9,10,19,71,72])),meta:{requiresAuth:!0,requiresAdmin:!1,title:"Purchase Subscription",titleKey:"purchase.title",descriptionKey:"purchase.description"}}'
new_purchase = old_purchase + ',{path:"/orders",name:"UserOrders",component:()=>w(()=>import("./PurchaseSubscriptionView-DDDC2WHV.js"),__vite__mapDeps([70,40,1,6,7,3,9,10,19,71,72])),meta:{requiresAuth:!0,requiresAdmin:!1,title:"Order Management",titleKey:"orders.title",descriptionKey:"orders.description"}}'
if old_purchase not in text:
    raise SystemExit("purchase route pattern missing")
text = text.replace(old_purchase, new_purchase, 1)
old_admin_sub = '{path:"/admin/subscriptions",name:"AdminSubscriptions",component:()=>w(()=>import("./SubscriptionsView-CKJqZ8vF.js"),__vite__mapDeps([89,1,46,40,6,7,3,9,10,19,48,49,61,59,50,2,4,51,52,53,54,55,56,57,90])),meta:{requiresAuth:!0,requiresAdmin:!0,title:"Subscription Management",titleKey:"admin.subscriptions.title",descriptionKey:"admin.subscriptions.description"}}'
new_admin_sub = old_admin_sub + ',{path:"/admin/orders",name:"AdminOrders",component:()=>w(()=>import("./PurchaseSubscriptionView-DDDC2WHV.js"),__vite__mapDeps([70,40,1,6,7,3,9,10,19,71,72])),meta:{requiresAuth:!0,requiresAdmin:!0,title:"Order Management",titleKey:"orders.title",descriptionKey:"orders.description"}}'
if old_admin_sub not in text:
    raise SystemExit("admin subscriptions route pattern missing")
text = text.replace(old_admin_sub, new_admin_sub, 1)
index_path.write_text(text)
print("patched remote production assets")
