import React from "react";
import { View, Text, StyleSheet, Platform, Dimensions } from "react-native";
import { WebView } from "react-native-webview";

interface EmailBodyRendererProps {
  body: string;
  bodyType: "html" | "plain";
  backgroundColor?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const WEBVIEW_MIN_HEIGHT = Math.round(SCREEN_HEIGHT * 0.5);

function buildHtmlDoc(html: string, bg: string, text: string, muted: string, border: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
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
    *[width] {
      max-width: 100% !important;
    }
  </style>
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
  if (bodyType === "html" && body.trim()) {
    const htmlDoc = buildHtmlDoc(body, backgroundColor, textColor, mutedColor, borderColor);

    return (
      <View style={{ minHeight: WEBVIEW_MIN_HEIGHT, width: "100%" }}>
        <WebView
          source={{ html: htmlDoc }}
          style={{ minHeight: WEBVIEW_MIN_HEIGHT, backgroundColor: "transparent" }}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          originWhitelist={[]}
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction={true}
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
