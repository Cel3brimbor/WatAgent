// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "tauri-plugin-oauth",
  platforms: [
    .iOS(.v17),
  ],
  products: [
    .library(
      name: "tauri-plugin-oauth",
      type: .static,
      targets: ["tauri-plugin-oauth"]
    )
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-oauth",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources",
      linkerSettings: [
        .linkedFramework("AuthenticationServices")
      ]
    )
  ]
)
