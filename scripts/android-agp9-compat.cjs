const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function edit(relative, transform) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Android compatibility file missing: ${relative}`);
  const original = fs.readFileSync(file, 'utf8');
  const updated = transform(original);
  if (updated !== original) fs.writeFileSync(file, updated);
}

// AGP 9 removed the targetSdk setter from Android library modules.
edit('node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt', text =>
  text.replace('    this@defaultConfig.targetSdk = targetSdk', '    // targetSdk is an application setting; AGP 9 removed the library setter.'));

// Register shared library callbacks once, before any library DSL is finalized.
edit('node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/AgpConfiguratorUtils.kt', text => {
  for (const name of ['configureBuildConfigFieldsForLibraries', 'configureNamespaceForLibraries']) {
    const marker = `voxen.${name}.registered`;
    if (text.includes(marker)) continue;
    const declaration = `  fun ${name}(appProject: Project) {`;
    if (!text.includes(declaration)) throw new Error(`React Native callback changed: ${name}`);
    text = text.replace(declaration, `${declaration}\n    val marker = "${marker}"\n    val rootExtras = appProject.rootProject.extensions.extraProperties\n    if (rootExtras.has(marker)) return\n    rootExtras.set(marker, true)`);
  }
  return text;
});

edit('node_modules/react-native-worklets/android/build.gradle.kts', text => {
  if (!text.includes('    id("com.facebook.react")')) {
    text = text.replace('    id("com.android.library")', '    id("com.android.library")\n    id("com.facebook.react")');
  }
  return text.replace(/if \(project != rootProject\) \{\s*apply\(plugin = "com.facebook.react"\)\s*\}/, '');
});
console.log('Voxen Android AGP 9 compatibility applied.');
