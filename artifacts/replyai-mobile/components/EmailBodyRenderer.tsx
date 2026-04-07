import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

interface EmailBodyRendererProps {
  body: string;
  bodyType: "html" | "plain";
  backgroundColor?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
}

const INJECTED_JS = `
(function() {
  function reportHeight() {
    var h = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: h }));
  }
  reportHeight();
  window.addEventListener('load', reportHeight);
  var mo = new MutationObserver(reportHeight);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true });
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 800);
  setTimeout(reportHeight, 1500);
  setTimeout(reportHeight, 3000);
})();
true;
`;

function buildHtmlDoc(html: string, bg: string, text: string, muted: string, border: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=0.5, user-scalable=yes" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, 'Inter', 'SF Pro Text', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    body {
      padding: 12px 12px 20px 12px;
    }
    .email-content-wrapper {
      max-width: 100%;
      overflow-x: hidden;
    }
    p, div, span, li, td, th, h1, h2, h3, h4, h5, h6 {
      color: inherit !important;
    }
    a {
      color: ${text} !important;
      text-decoration: underline;
      word-break: break-all;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
      display: block;
      border-radius: 4px;
    }
    /* Make marketing email tables flow to mobile width */
    table {
      max-width: 100% !important;
      width: 100% !important;
      table-layout: auto !important;
      word-break: break-word;
    }
    td, th {
      word-break: break-word;
      max-width: 100% !important;
    }
    /* Enforce a minimum readable font size — fine print boosted to 12px */
    * {
      -webkit-text-size-adjust: none !important;
    }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      background: rgba(128,128,128,0.15);
      border-radius: 4px;
      padding: 2px 4px;
      color: ${text} !important;
    }
    pre {
      padding: 12px;
    }
    blockquote {
      margin: 8px 0;
      padding: 4px 12px;
      border-left: 3px solid ${border};
      color: ${muted} !important;
    }
    blockquote p, blockquote div, blockquote span {
      color: ${muted} !important;
    }
    hr {
      border: none;
      border-top: 1px solid ${border};
      margin: 12px 0;
    }
    /* Override white/black backgrounds from marketing emails */
    *[style*="background-color: white"],
    *[style*="background-color: #fff"],
    *[style*="background-color: #ffffff"],
    *[style*="background: white"],
    *[style*="background: #fff"],
    *[style*="background: #ffffff"] {
      background-color: ${bg} !important;
    }
    *[style*="color: black"],
    *[style*="color: #000"],
    *[style*="color: #000000"],
    *[style*="color: rgb(0,0,0)"],
    *[style*="color: rgb(0, 0, 0)"] {
      color: ${text} !important;
    }
    *[width] {
      max-width: 100% !important;
    }
  </style>
  <script>
    // Boost any inline font-size styles smaller than 12px up to 12px
    document.addEventListener('DOMContentLoaded', function() {
      var all = document.querySelectorAll('[style]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var style = el.getAttribute('style') || '';
        var match = style.match(/font-size:\\s*(\\d+(?:\\.\\d+)?)(px|pt)/i);
        if (match) {
          var size = parseFloat(match[1]);
          var unit = match[2].toLowerCase();
          var px = unit === 'pt' ? size * 1.333 : size;
          if (px < 12) {
            el.style.fontSize = '12px';
          }
        }
      }
    });
  </script>
</head>
<body><div class="email-content-wrapper">${html}</div></body>
</html>`;
}

export function EmailBodyRenderer({
  body,
  bodyType,
  backgroundColor = "#ffffff",
  textColor = "#0a0a0a",
  mutedColor = "#737373",
  borderColor = "#e5e5e5",
}: EmailBodyRendererProps) {
  const [webViewHeight, setWebViewHeight] = useState(200);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { type: string; height: number };
      if (data.type === "height" && data.height > 0) {
        setWebViewHeight(Math.max(data.height, 200));
      }
    } catch {}
  }, []);

  if (bodyType === "html" && body.trim()) {
    const htmlDoc = buildHtmlDoc(body, backgroundColor, textColor, mutedColor, borderColor);

    return (
      <View style={{ height: webViewHeight, width: "100%" }}>
        <WebView
          source={{ html: htmlDoc }}
          style={{ flex: 1, backgroundColor: "transparent" }}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          injectedJavaScript={INJECTED_JS}
          onMessage={onMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled={false}
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction
          scalesPageToFit={false}
          onShouldStartLoadWithRequest={(req) => {
            if (req.navigationType === "click") return false;
            return req.url === "about:blank" || req.url.startsWith("data:");
          }}
        />
      </View>
    );
  }

  // Plain text rendering
  const lines = (body || "").trim().split("\n");
  return (
    <View style={[styles.plainContainer, { backgroundColor }]}>
      {lines.map((line, i) => {
        const isQuote = line.startsWith(">");
        const isBlank = line.trim() === "";
        if (isBlank) {
          return <View key={i} style={styles.blankLine} />;
        }
        return (
          <Text
            key={i}
            style={[
              styles.plainLine,
              { color: isQuote ? mutedColor : textColor },
              isQuote && [styles.quotedLine, { borderLeftColor: borderColor }],
            ]}
          >
            {isQuote ? line.replace(/^>+\s?/, "") : line}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  plainContainer: {
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  plainLine: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: Platform.select({ ios: "Inter_400Regular", android: "Inter_400Regular", default: "system-ui" }),
  },
  quotedLine: {
    paddingLeft: 12,
    borderLeftWidth: 3,
    opacity: 0.6,
  },
  blankLine: {
    height: 6,
  },
});
