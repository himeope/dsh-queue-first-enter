// dsh-queue-first-enter — client.js (browser half)
//
// 功能：当「繁忙时 Enter 键行为」为队列模式、输入框空白（无文字、无图片）、
// 且队列里还有待发消息时，按 Enter 立刻把队列**第一条**消息插话发送（steer）
// 到当前回合，而不是干等回合结束。其余排队消息保持原顺序。
//
// 与自带快捷键的区别：产品自带的 Ctrl/Cmd+Enter 是「插话发送全部排队消息」，
// 本插件只动第一条，且使用裸 Enter；Ctrl/Cmd+Enter 的原有行为不受影响。
//
// 设置入口：设置 → 通用 → 「繁忙时 Enter 键行为」下方的一行开关。

var loader = typeof window !== "undefined" ? window.__ModuleLoader__ : undefined;
if (!loader || typeof loader.load !== "function") {
  // 没有 DSH 模块系统（例如文件被当普通脚本加载）——安静退出，别抛异常。
} else loader.load({
  id: "dsh-queue-first-enter",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // 两个服务都用 ctx.get 可选读取：宿主组合里没有时插件安静降级，不进入等待。
    var inject = [];

    // React 由 DSH 模块系统提供；动态/独立插件都可能拿不到，拿不到就静默降级。
    var React = null;
    try { React = require("react"); } catch (e) {}

    var STORAGE_KEY = "dsh.queueFirstEnter.enabled";

    /** 插件级共享状态：设置行写，输入框监听读。 */
    var state = {
      enabled: true,
      listeners: [],
      subscribe: function (fn) {
        state.listeners.push(fn);
        return function () {
          var i = state.listeners.indexOf(fn);
          if (i >= 0) state.listeners.splice(i, 1);
        };
      },
      set: function (next) {
        if (state.enabled === next) return;
        state.enabled = next;
        try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch (e) {}
        for (var i = 0; i < state.listeners.length; i++) {
          try { state.listeners[i](next); } catch (e) {}
        }
      },
    };

    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "0") state.enabled = false;
      else if (saved === "1") state.enabled = true;
    } catch (e) {}

    /** 读一条快照的队首待发消息 id；没有就返回 undefined。 */
    function firstQueuedId(session) {
      if (!session) return undefined;
      var snapshot = session.getSnapshot();
      var queue = snapshot.queue || [];
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].placement === "queued") return queue[i].id;
      }
      return undefined;
    }

    function apply(ctx) {
      if (!React) return;

      var slots = ctx.get("slots");
      if (!slots) return;
      var sessions = ctx.get("sessions");

      var currentSessionId;

      function sessionOf(sessionId) {
        if (!sessions || typeof sessionId !== "string" || sessionId === "") return undefined;
        var binding = sessions.binding(sessionId);
        return binding ? binding.session : undefined;
      }

      function steerFirst(sessionId) {
        var session = sessionOf(sessionId);
        if (!session) return;
        var itemId = firstQueuedId(session);
        if (itemId === undefined) return;
        // 严格插话：仅当该项仍在 next-turn 且 agent 正在运行才会被接受；
        // 回合刚好结束（steer-unavailable）或已被 agent 领取
        // （queue-item-not-found）都按静默收敛处理，消息仍在队列里。
        session.updateQueue(itemId, { kind: "steer" }).then(function (result) {
          if (result && result.ok) return;
          var code = result && result.error ? result.error.code : undefined;
          if (code === "steer-unavailable" || code === "queue-item-not-found") return;
          try {
            console.warn("[dsh-queue-first-enter] 发送队列首条失败：", code || "unknown");
          } catch (e) {}
        }, function (error) {
          try {
            console.warn("[dsh-queue-first-enter] 发送队列首条异常：", error);
          } catch (e) {}
        });
      }

      // --- 输入框监听：挂在 composer 的 textarea 上，捕获阶段先于产品处理 ---
      function ComposerAnchor(props) {
        currentSessionId = props.sessionId;
        var anchorRef = React.useRef(null);
        var stateRef = React.useRef(null);

        stateRef.current = {
          sessionId: props.sessionId,
          draft: props.input ? props.input.draft : "",
          imageCount: props.input && props.input.imageIds ? props.input.imageIds.length : 0,
          phase: props.input ? props.input.phase : "plain",
        };

        React.useEffect(function () {
          var anchor = anchorRef.current;
          if (!anchor) return undefined;
          var card = anchor.closest("[data-composer-card]");
          var host = card || anchor.parentElement;
          if (!host) return undefined;
          var area = host.querySelector("textarea");
          if (!area) return undefined;

          function onKeyDown(event) {
            if (!state.enabled) return;
            if (event.key !== "Enter" || event.isComposing || event.repeat) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (area.disabled || area.readOnly) return;

            var current = stateRef.current;
            if (!current || current.phase !== "plain") return;
            if (current.draft.trim() !== "" || current.imageCount > 0) return;

            var session = sessionOf(current.sessionId);
            if (!session) return;
            if (session.getSnapshot().running !== true) return;
            if (firstQueuedId(session) === undefined) return;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            steerFirst(current.sessionId);
          }

          area.addEventListener("keydown", onKeyDown, true);
          return function () {
            area.removeEventListener("keydown", onKeyDown, true);
          };
        }, []);

        return React.createElement("span", {
          ref: anchorRef,
          hidden: true,
          "aria-hidden": "true",
        });
      }

      var anchorDispose = slots.inject("conversation.input.left", function () {
        return slots.register(
          { name: "conversation.input.left", id: "queue-first-enter" },
          ComposerAnchor
        );
      });

      // --- 设置行：设置 → 通用 → 「繁忙时 Enter 键行为」下方 ---
      // 全部用内联样式：不依赖 styles 服务，也不依赖任何全局 CSS 类，
      // 因此样式注入不可用时开关依然可见。
      function QueueFirstEnterRow() {
        var enabled = React.useState(state.enabled);
        React.useEffect(function () {
          var off = state.subscribe(function (next) { enabled[1](next); });
          return off;
        }, []);

        // 与产品自带设置行（EnterBehaviorRow）对齐：16px 内边距、l2 边框、
        // 标题 14/22、说明 12/18 且用 tertiary 色。
        var rowStyle = {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
          padding: "16px 0",
          borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22))",
        };
        var textStyle = {
          display: "flex",
          flexDirection: "column",
          flex: "1",
          gap: "4px",
          minWidth: "0",
          paddingRight: "48px",
        };
        var titleStyle = {
          fontSize: "14px",
          fontWeight: "400",
          lineHeight: "22px",
          color: "var(--dsw-alias-label-primary, inherit)",
        };
        var descStyle = {
          fontSize: "12px",
          fontWeight: "400",
          lineHeight: "18px",
          color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,.9))",
        };
        var on = enabled[0] === true;
        var toggleStyle = {
          position: "relative",
          flex: "none",
          width: "44px",
          height: "24px",
          marginTop: "4px",
          padding: "0",
          border: "none",
          borderRadius: "12px",
          cursor: "pointer",
          background: on
            ? "var(--dsw-alias-brand-primary, #4d6bfe)"
            : "var(--dsw-alias-border-l1, rgba(128,128,128,.45))",
          transition: "background .2s",
        };
        var knobStyle = {
          position: "absolute",
          top: "2px",
          left: on ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "var(--dsw-alias-bg-base, #fff)",
          transition: "left .2s",
        };

        return React.createElement(
          "div",
          { className: "dsh-qfe-row", style: rowStyle },
          React.createElement(
            "div",
            { className: "dsh-qfe-text", style: textStyle },
            React.createElement("div", { className: "dsh-qfe-title", style: titleStyle }, "回车立即发送队列首条"),
            React.createElement(
              "div",
              { className: "dsh-qfe-desc", style: descStyle },
              "开启后：输入框空白且队列有待发消息时，按 Enter 立刻把队列第一条插话发送到当前回合；Ctrl/Cmd+Enter 的「插话全部」行为不变。"
            )
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-qfe-toggle" + (on ? " on" : ""),
              style: toggleStyle,
              role: "switch",
              "aria-checked": on ? "true" : "false",
              "aria-label": "回车立即发送队列首条",
              title: on ? "已开启" : "已关闭",
              onClick: function () { state.set(!on); },
            },
            React.createElement("span", { className: "dsh-qfe-knob", style: knobStyle })
          )
        );
      }

      // 注意：整行都是内联样式，不注入任何全局 CSS——即使样式服务不可用，
      // 开关也始终可见（早期版本依赖 ctx.get("styles") 注入，曾导致开关不可见）。

      var settingsDispose = slots.inject("settings.general.item", function () {
        return slots.register(
          { name: "settings.general.item", id: "queue-first-enter", order: 21 },
          QueueFirstEnterRow
        );
      });

      ctx.effect(function () {
        return function () {
          settingsDispose();
          anchorDispose();
        };
      }, "dsh-queue-first-enter: settings row + composer anchor");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
