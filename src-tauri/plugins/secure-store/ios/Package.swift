// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "tauri-plugin-secure-store",
  platforms: [
    .iOS(.v17),
  ],
  products: [
    .library(
      name: "tauri-plugin-secure-store",
      type: .static,
      targets: ["tauri-plugin-secure-store"]
    )
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-secure-store",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources",
      linkerSettings: [
        .linkedFramework("Security")
      ]
    )
  ]
)
