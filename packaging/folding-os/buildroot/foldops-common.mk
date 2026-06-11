################################################################################
# Shared variables for foldops-agent and foldops-supervisor Buildroot packages.
#
# Copy into pacificnm/folding-os and bump FOLDOPS_VERSION when tagging foldops.
################################################################################

# Pin to a foldops git tag (e.g. v0.1.0). Override in folding-os defconfig if needed.
FOLDOPS_VERSION ?= 0.1.0

FOLDOPS_SITE = $(call github,pacificnm,foldops,v$(FOLDOPS_VERSION))
FOLDOPS_SITE_METHOD = git
FOLDOPS_LICENSE = MIT
FOLDOPS_LICENSE_FILES = LICENSE

# folding-os should provide host Rust + OpenSSL/SQLite dev libs for the target.
# Typical deps (adjust to match your Buildroot rust toolchain package names):
FOLDOPS_HOST_CARGO_DEPENDENCIES = host-cargo host-rust
FOLDOPS_TARGET_DEPENDENCIES = openssl sqlite

# Offline builds: run ./scripts/vendor-rust-deps.sh in foldops, commit vendor/ or
# ship vendor/ in the release source tarball. Set BR2_FOLDOPS_CARGO_OFFLINE=y.
FOLDOPS_CARGO_ENV = \
	CARGO_HOME=$(HOST_DIR)/share/cargo \
	RUSTFLAGS="$(TARGET_RUSTFLAGS)"

ifeq ($(BR2_FOLDOPS_CARGO_OFFLINE),y)
FOLDOPS_CARGO_ENV += CARGO_NET_OFFLINE=true
define FOLDOPS_CHECK_VENDOR_HOOK
	test -f $(@D)/.cargo/config.toml || test -d $(@D)/vendor || \
		(echo "foldops: vendor/ missing — run scripts/vendor-rust-deps.sh" && exit 1)
endef
endif

# folding-os must set TARGET_RUSTC when cross-compiling (e.g. x86_64-unknown-linux-gnu).
FOLDOPS_CARGO_BUILD = \
	cd $(@D) && \
	$(FOLDOPS_CARGO_ENV) \
	$(HOST_DIR)/bin/cargo build --release \
		--target $(TARGET_RUSTC) \
		--target-dir $(@D)/target

FOLDOPS_AGENT_BIN = $(@D)/target/$(TARGET_RUSTC)/release/foldops-agent
FOLDOPS_SUPERVISOR_BIN = $(@D)/target/$(TARGET_RUSTC)/release/foldops-supervisor
