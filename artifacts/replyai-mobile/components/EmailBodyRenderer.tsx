import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

interface EmailBodyRendererProps {
  body: string;
  bodyType: "html" | "plain";
  backgroundColor?: string;
  textColor?: string;
  mutedColor?: string;
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
  // Report immediately
  reportHeight();
  // Re-report after images/fonts load
  window.addEventListener('load', reportHeight);
  // Re-report on any DOM mutation (e.g. lazy images)
  var mo = new MutationObserver(reportHeight);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true });
  // Fallback poll for tricky templates
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 800);
  setTimeout(reportHeight, 1500);
})();
true;
`;

function buildHtmlDoc(html: string, bg: string, text: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, 'Inter', 'SF Pro Text', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    body {
      padding: 4px 2px 12px 2px;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
      display: block;
    }
    table {
      max-width: 100% !important;
      table-layout: fixed;
      word-break: break-word;
    }
    td, th {
      word-break: break-word;
    }
    a {
      color: ${text};
      word-break: break-all;
    }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      background: rgba(128,128,128,0.08);
      border-radius: 4px;
      padding: 2px 4px;
    }
    pre {
      padding: 10px;
    }
    /* Force any fixed-width elements to be responsive */
    *[width] {
      max-width: 100% !important;
    }
    *[style*="width"] {
      max-width: 100% !important;
    }
  </style>
</head>
<body>${html}</body>
</html>`;
}

export function EmailBodyRenderer({
  body,
  bodyType,
  backgroundColor = "#ffffff",
  textColor = "#0a0a0a",
  mutedColor = "#737373",
}: EmailBodyRendererProps) {
  const [webViewHeight, setWebViewHeight] = useState(200);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { type: string; height: number };
      if (data.type === "height" && data.height > 0) {
        setWebViewHeight(data.height);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  if (bodyType === "html" && body.trim()) {
    const htmlDoc = buildHtmlDoc(body, backgroundColor, textColor);

    return (
      <View style={{ height: webViewHeight }}>
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
    <View style={styles.plainContainer}>
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
              isQuote && styles.quotedLine,
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
    paddingVertical: 4,
  },
  plainLine: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.select({ ios: "Inter_400Regular", android: "Inter_400Regular", default: "system-ui" }),
  },
  quotedLine: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#d4d4d4",
    opacity: 0.7,
  },
  blankLine: {
    height: 8,
  },
});
