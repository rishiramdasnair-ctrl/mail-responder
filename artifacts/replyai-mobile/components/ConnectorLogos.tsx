import React from "react";
import Svg, { Path, G, Rect, Circle, Ellipse } from "react-native-svg";

interface LogoProps {
  size: number;
  color: string;
}

export function GmailLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 18">
      <Path
        fill={color}
        d="M2 0h20C23.1 0 24 .9 24 2v14c0 1.1-.9 2-2 2H2a2 2 0 01-2-2V2C0 .9.9 0 2 0z"
        fillOpacity={0}
      />
      <Path
        fill={color}
        d="M0 2.4V16h24V2.4L12 10.5 0 2.4z"
        fillOpacity={0.18}
      />
      <Path
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        d="M0 2.5l12 8 12-8"
      />
      <Path
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
        d="M0 2A2 2 0 012 0h20a2 2 0 012 2v14a2 2 0 01-2 2H2a2 2 0 01-2-2V2z"
      />
    </Svg>
  );
}

export function CalendarLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Rect
        x="1"
        y="3"
        width="20"
        height="18"
        rx="2.5"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
      <Path
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        d="M1 8h20"
      />
      <Path
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        d="M7 1v4M15 1v4"
      />
      <Rect x="5.5" y="12" width="3" height="3" rx="0.5" fill={color} />
      <Rect x="9.5" y="12" width="3" height="3" rx="0.5" fill={color} />
      <Rect x="13.5" y="12" width="3" height="3" rx="0.5" fill={color} />
    </Svg>
  );
}

export function GitHubLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
      />
    </Svg>
  );
}

export function LinearLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        fill={color}
        d="M1.22 61.5L38.5 98.78a50.02 50.02 0 0023.86-13.01L14.23 37.64A50.02 50.02 0 001.22 61.5zM0 50c0 5.76.97 11.29 2.76 16.43L33.57 2.76A50 50 0 000 50zM50 0c-5.76 0-11.29.97-16.43 2.76L97.24 66.43A50 50 0 0050 0zM62.37 1.22L1.22 62.37c3.53 13.62 12.79 24.97 25.01 31.27L93.64 25.23A49.97 49.97 0 0062.37 1.22z"
      />
    </Svg>
  );
}


export function NotionLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"
      />
    </Svg>
  );
}

export function LinkedInLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </Svg>
  );
}

export function CalendlyLogo({ size, color }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.4a9.6 9.6 0 110 19.2A9.6 9.6 0 0112 2.4zm0 2.4a7.2 7.2 0 100 14.4A7.2 7.2 0 0012 4.8zm2.88 3.6H9.12A1.32 1.32 0 007.8 9.72v4.56a1.32 1.32 0 001.32 1.32h5.76a1.32 1.32 0 001.32-1.32V9.72a1.32 1.32 0 00-1.32-1.32zM9.6 7.2V6a.6.6 0 011.2 0v1.2H9.6zm3.6 0V6a.6.6 0 011.2 0v1.2H13.2zM9.12 9.6h5.76a.12.12 0 01.12.12V11H9v-.28a.12.12 0 01.12-.12zM9 11.8h6v2.48a.12.12 0 01-.12.12H9.12A.12.12 0 019 14.28V11.8z"
      />
    </Svg>
  );
}

export function getConnectorLogo(connectorId: string): React.ComponentType<LogoProps> | null {
  switch (connectorId) {
    case "gmail": return GmailLogo;
    case "calendar": return CalendarLogo;
    case "github": return GitHubLogo;
    case "linear": return LinearLogo;
    case "notion": return NotionLogo;
    case "linkedin": return LinkedInLogo;
    case "calendly": return CalendlyLogo;
    default: return null;
  }
}

export interface ConnectorLogoImage {
  source: number;
  resizeMode: "cover" | "contain";
  backgroundColor: string;
  padding: number;
}

export function getConnectorLogoImage(connectorId: string): ConnectorLogoImage | null {
  switch (connectorId) {
    case "slack":
      return { source: require("../assets/images/slack.png"), resizeMode: "contain", backgroundColor: "#000", padding: 4 };
    case "hubspot":
      return { source: require("../assets/images/hubspot.png"), resizeMode: "contain", backgroundColor: "#fff", padding: 4 };
    default:
      return null;
  }
}
