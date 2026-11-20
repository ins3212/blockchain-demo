const { expect } = require("chai");
const { ethers } = require("hardhat");

const hashDoc = (idNumber, dob) => ethers.keccak256(ethers.toUtf8Bytes(`${idNumber}|${dob}`));
const ETH = (v) => ethers.parseEther(v);

describe("Identity + Asset tokenization demo", function () {
  let registry, token, admin, alice, bob, carol;

  beforeEach(async function () {
    [admin, alice, bob, carol] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    token = await (await ethers.getContractFactory("AssetToken")).deploy(await registry.getAddress());
  });

  async function verified(user, idNumber) {
    await registry.connect(user).register("User " + idNumber, "VN", hashDoc(idNumber, "2000-01-01"));
    await registry.verify(user.address);
  }

  describe("IdentityRegistry", function () {
    it("register -> pending -> verified", async function () {
      const h = hashDoc("001200001234", "2000-01-01");
      await expect(registry.connect(alice).register("Alice", "VN", h))
        .to.emit(registry, "IdentityRegistered")
        .withArgs(alice.address, "Alice", h);
      expect((await registry.getIdentity(alice.address)).status).to.equal(1n);
      expect(await registry.isVerified(alice.address)).to.equal(false);

      await registry.verify(alice.address);
      expect(await registry.isVerified(alice.address)).to.equal(true);
      expect(await registry.checkDocument(alice.address, h)).to.equal(true);
      expect(await registry.checkDocument(alice.address, hashDoc("999", "2000-01-01"))).to.equal(false);
    });

    it("one document cannot be used by two wallets", async function () {
      const h = hashDoc("001", "2000-01-01");
      await registry.connect(alice).register("Alice", "VN", h);
      await expect(registry.connect(bob).register("Bob", "VN", h)).to.be.revertedWith("Document already used");
    });

    it("only verifier can verify / revoke; revoked user can re-register", async function () {
      await registry.connect(alice).register("Alice", "VN", hashDoc("001", "2000-01-01"));
      await expect(registry.connect(bob).verify(alice.address)).to.be.revertedWith("Only verifier");

      await registry.setVerifier(bob.address, true);
      await registry.connect(bob).verify(alice.address);
      await registry.connect(bob).revoke(alice.address, "Fake document");
      expect(await registry.isVerified(alice.address)).to.equal(false);
      expect((await registry.getIdentity(alice.address)).note).to.equal("Fake document");

      await registry.connect(alice).register("Alice", "VN", hashDoc("002", "2000-01-01"));
      expect((await registry.getIdentity(alice.address)).status).to.equal(1n);
      expect((await registry.getUsers()).length).to.equal(1);
    });
  });

  describe("AssetToken", function () {
    beforeEach(async function () {
      await token.createAsset("Sunrise Apartment", "realestate", "70m2", 1000, ETH("0.01"));
    });

    it("only owner can tokenize an asset", async function () {
      await expect(token.connect(alice).createAsset("X", "other", "", 10, 1)).to.be.revertedWith("Only owner");
    });

    it("unverified wallet cannot buy", async function () {
      await expect(token.connect(alice).buyShares(0, 10, { value: ETH("0.1") })).to.be.revertedWith(
        "Identity not verified"
      );
    });

    it("verified wallet buys shares with exact payment", async function () {
      await verified(alice, "001");
      await expect(token.connect(alice).buyShares(0, 10, { value: ETH("0.05") })).to.be.revertedWith("Wrong payment");
      await token.connect(alice).buyShares(0, 10, { value: ETH("0.1") });
      expect(await token.balanceOf(0, alice.address)).to.equal(10n);
      expect((await token.getAssets())[0].sharesSold).to.equal(10n);
      await expect(token.connect(alice).buyShares(0, 991, { value: ETH("9.91") })).to.be.revertedWith(
        "Not enough shares left"
      );
    });

    it("transfer requires both sides verified", async function () {
      await verified(alice, "001");
      await token.connect(alice).buyShares(0, 10, { value: ETH("0.1") });
      await expect(token.connect(alice).transferShares(0, bob.address, 4)).to.be.revertedWith("Recipient not verified");

      await verified(bob, "002");
      await token.connect(alice).transferShares(0, bob.address, 4);
      expect(await token.balanceOf(0, alice.address)).to.equal(6n);
      expect(await token.balanceOf(0, bob.address)).to.equal(4n);

      const [accounts, shares] = await token.getHolders(0);
      expect(accounts).to.deep.equal([alice.address, bob.address]);
      expect(shares).to.deep.equal([6n, 4n]);
    });

    it("revoked identity is blocked from buying", async function () {
      await verified(alice, "001");
      await registry.revoke(alice.address, "Expired");
      await expect(token.connect(alice).buyShares(0, 1, { value: ETH("0.01") })).to.be.revertedWith(
        "Identity not verified"
      );
    });

    it("income is shared pro-rata and survives transfers", async function () {
      await verified(alice, "001");
      await verified(bob, "002");
      await verified(carol, "003");
      await token.connect(alice).buyShares(0, 30, { value: ETH("0.3") });
      await token.connect(bob).buyShares(0, 10, { value: ETH("0.1") });

      await token.distributeIncome(0, { value: ETH("4") }); // 0.1 ETH / share
      expect(await token.claimableIncome(0, alice.address)).to.equal(ETH("3"));
      expect(await token.claimableIncome(0, bob.address)).to.equal(ETH("1"));

      // Alice chuyển 10 cổ phần cho Carol: thu nhập cũ vẫn thuộc về Alice
      await token.connect(alice).transferShares(0, carol.address, 10);
      expect(await token.claimableIncome(0, alice.address)).to.equal(ETH("3"));
      expect(await token.claimableIncome(0, carol.address)).to.equal(0n);

      await token.distributeIncome(0, { value: ETH("4") });
      expect(await token.claimableIncome(0, alice.address)).to.equal(ETH("5")); // 3 + 20*0.1
      expect(await token.claimableIncome(0, carol.address)).to.equal(ETH("1"));

      await expect(token.connect(alice).claimIncome(0)).to.changeEtherBalance(alice, ETH("5"));
      await expect(token.connect(alice).claimIncome(0)).to.be.revertedWith("Nothing to claim");
    });

    it("owner withdraws sale proceeds, sale can be closed", async function () {
      await verified(alice, "001");
      await token.connect(alice).buyShares(0, 10, { value: ETH("0.1") });
      await expect(token.withdrawProceeds()).to.changeEtherBalance(admin, ETH("0.1"));
      await expect(token.withdrawProceeds()).to.be.revertedWith("Nothing to withdraw");

      await token.setSaleOpen(0, false);
      await expect(token.connect(alice).buyShares(0, 1, { value: ETH("0.01") })).to.be.revertedWith("Sale closed");
    });
  });
});
