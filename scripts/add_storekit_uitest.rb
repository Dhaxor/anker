# Injects an XCUITest target wired for StoreKit Testing into the prebuilt
# Xcode project. Runs in CI after `expo prebuild` — the ios/ directory is
# generated, so this cannot live in the project itself.
#
#   ruby scripts/add_storekit_uitest.rb
#
# Adds:
#   - UI-test target AnkerUITests containing e2e/storekit/PurchaseUITest.swift
#   - the local store definition e2e/storekit/Anker.storekit as a resource
#   - a shared AnkerUITests scheme (app builds, test target tests)
#
# StoreKitTest.framework lives in the platform developer frameworks, hence
# the FRAMEWORK_SEARCH_PATHS entry.
require 'xcodeproj'

project_path = 'ios/Anker.xcodeproj'
proj = Xcodeproj::Project.open(project_path)
app = proj.targets.find { |t| t.name == 'Anker' }
abort('app target "Anker" not found') unless app

t = proj.new_target(:ui_test_bundle, 'AnkerUITests', :ios, '16.4')
t.add_dependency(app)

t.build_configurations.each do |c|
  bs = c.build_settings
  bs['TEST_TARGET_NAME'] = 'Anker'
  bs['PRODUCT_BUNDLE_IDENTIFIER'] = 'app.anker.einbuergerung.uitests'
  bs['GENERATE_INFOPLIST_FILE'] = 'YES'
  bs['SWIFT_VERSION'] = '5.0'
  bs['CODE_SIGNING_ALLOWED'] = 'NO'
  bs['FRAMEWORK_SEARCH_PATHS'] = ['$(inherited)', '$(PLATFORM_DIR)/Developer/Library/Frameworks']
  bs['OTHER_LDFLAGS'] = ['$(inherited)', '-framework', 'StoreKitTest']
end

group = proj.main_group.new_group('AnkerUITests', '../e2e/storekit')
src = group.new_file('PurchaseUITest.swift')
cfg = group.new_file('Anker.storekit')
t.source_build_phase.add_file_reference(src)
t.resources_build_phase.add_file_reference(cfg)

proj.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(t)
scheme.set_launch_target(app)
scheme.save_as(project_path, 'AnkerUITests', true)

puts 'AnkerUITests target + shared scheme added'
