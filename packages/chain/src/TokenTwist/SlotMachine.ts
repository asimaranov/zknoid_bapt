import { 
  RuntimeModule, 
  runtimeMethod, 
  runtimeModule, 
  state 
} from '@proto-kit/module';
import {
  Field,
  PublicKey,
  Poseidon,
  Provable,
} from 'o1js';
import { 
  State, 
  StateMap, 
  assert 
} from '@proto-kit/protocol';
import { UInt64 } from '@proto-kit/library';
import { RandomGenerator } from '../engine';
import { Balances } from '@proto-kit/library';
import { inject } from 'tsyringe';
import { ZNAKE_TOKEN_ID } from '../constants';

@runtimeModule()
export class SlotMachine extends RuntimeModule {
  @state() public jackpot = State.from<UInt64>(UInt64);
  @state() public lastSpins = StateMap.from<PublicKey, Field>(PublicKey, Field);
  @state() public lastSpinHashes = StateMap.from<PublicKey, Field>(PublicKey, Field);

  private randomGen: RandomGenerator;

  constructor(@inject('Balances') private balances: Balances) {
    super();
    this.randomGen = new RandomGenerator({ seed: Field.random(), source: Field.random(), curValue: Field.random() });
  }


  @runtimeMethod()
  public async spin(bet: UInt64): Promise<{ reel1: Field; reel2: Field; reel3: Field }> {
    const sender = this.transaction.sender.value;
    const playerBalance = await this.balances.getBalance(ZNAKE_TOKEN_ID, sender);
    
    assert(playerBalance.greaterThanOrEqual(bet), 'Insufficient balance');

    // Deduct bet from player balance
    await this.balances.setBalance(ZNAKE_TOKEN_ID, sender, playerBalance.sub(bet))

    // Generate random numbers for reels (0, 1, or 2 representing different symbols)
    const reel1 = Field.from(this.randomGen.getNumber(3).toString());
    const reel2 = Field.from(this.randomGen.getNumber(3).toString());
    const reel3 = Field.from(this.randomGen.getNumber(3).toString());

    // Hash the spin result using Poseidon
    const spinHash = Poseidon.hash([reel1, reel2, reel3]);
    
    // Store the last spin hash
    await this.lastSpinHashes.set(sender, spinHash);

    // Convert the result to UInt64 before setting it in lastSpins
    const spinResult = UInt64.from(0);
    spinResult.value = reel1.mul(Field(100)).add(reel2.mul(Field(10))).add(reel3);
    await this.lastSpins.set(sender, Field.from(spinResult.toString()));


    // Check if the player won the jackpot
    const isJackpot = Provable.if(
      reel1.equals(Field(0)).and(reel2.equals(Field(0))).and(reel3.equals(Field(0)))
        .or(reel1.equals(Field(1)).and(reel2.equals(Field(1))).and(reel3.equals(Field(1))))
        .or(reel1.equals(Field(2)).and(reel2.equals(Field(2))).and(reel3.equals(Field(2)))),
      Field(1),
      Field(0)
    );

    const currentJackpot = (await this.jackpot.get()).value;
    let newPlayerBalance = playerBalance;

    newPlayerBalance = Provable.if<UInt64>(
      isJackpot.equals(Field(1)),
      UInt64,
      newPlayerBalance.add(currentJackpot),
      newPlayerBalance
    );

    const newJackpot = Provable.if<UInt64>(
      isJackpot.equals(Field(1)),
      UInt64,
      UInt64.from(0),
      currentJackpot.add(bet)
    );

    await this.jackpot.set(newJackpot);

    const hasMatch = reel1.equals(reel2).or(reel2.equals(reel3)).or(reel1.equals(reel3));
    
    newPlayerBalance = Provable.if<UInt64>(
      hasMatch.and(isJackpot.equals(Field(0))),
      UInt64,
      newPlayerBalance.add(bet.mul(UInt64.from(2))),
      newPlayerBalance
    );

    await this.balances.setBalance(ZNAKE_TOKEN_ID, sender, newPlayerBalance)

    return { reel1, reel2, reel3 };
  }


  @runtimeMethod()
  public async verifySpin( reel1: Field, reel2: Field, reel3: Field): Promise<Field> {
    const sender = this.transaction.sender.value;
    const expectedHash = (await this.lastSpinHashes.get(sender)).value;

    // Recompute the hash of the spin result with provided reels
    const spinHash = Poseidon.hash([reel1, reel2, reel3]);

    // Verify that the recomputed hash matches the stored hash
    return Provable.if(expectedHash.equals(spinHash), Field(1), Field(0));
  }

  @runtimeMethod()
  public async deposit(amount: UInt64): Promise<void> {
    const sender = this.transaction.sender.value;
    const currentBalance = (await this.balances.getBalance(ZNAKE_TOKEN_ID, sender));
    await this.balances.setBalance(ZNAKE_TOKEN_ID, sender, currentBalance.add(amount))
  }

  @runtimeMethod()
  public async withdraw(amount: UInt64): Promise<void> {
    const sender = this.transaction.sender.value;
    const currentBalance = (await this.balances.getBalance(ZNAKE_TOKEN_ID, sender));
    assert(currentBalance.greaterThanOrEqual(amount), 'Insufficient balance');
    await this.balances.setBalance(ZNAKE_TOKEN_ID, sender, currentBalance.sub(amount));
  }

  @runtimeMethod()
  public async getBalance(): Promise<UInt64> {
    const sender = this.transaction.sender.value;
    return (await this.balances.getBalance(ZNAKE_TOKEN_ID, sender));
  }

  @runtimeMethod()
  public async getLastSpin(): Promise<Field> {
    const sender = this.transaction.sender.value;
    return (await this.lastSpins.get(sender)).value;
  }

  @runtimeMethod()
  public async getJackpot(): Promise<UInt64> {
    return (await this.jackpot.get()).value;
  }
}

export default SlotMachine;