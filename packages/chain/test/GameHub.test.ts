import { TestingAppChain } from '@proto-kit/sdk';
import { PrivateKey, Provable, UInt64, Int64, Field } from 'o1js';
import {
    GameHub,
    GameRecordProof,
    GameRecordPublicOutput,
    checkGameRecord,
    FIELD_SIZE,
    MAX_BRICKS,
    GAME_LENGTH,
    GameInputs,
    Tick,
    GameRecordKey,
    Bricks,
    Brick,
    IntPoint,
} from '../src/GameHub';
import { log } from '@proto-kit/common';
import { Pickles } from 'o1js/dist/node/snarky';
import { dummyBase64Proof } from 'o1js/dist/node/lib/proof_system';
import { checkRange } from 'o1js/dist/node/provable/field-bigint';

log.setLevel('ERROR');

async function mockProof(
    publicOutput: GameRecordPublicOutput
): Promise<GameRecordProof> {
    const [, proof] = Pickles.proofOfBase64(await dummyBase64Proof(), 2);
    return new GameRecordProof({
        proof: proof,
        maxProofsVerified: 2,
        publicInput: undefined,
        publicOutput,
    });
}

describe('game hub', () => {
    it('Check if cheet codes works', async () => {
        const appChain = TestingAppChain.fromRuntime({
            modules: {
                GameHub,
            },
            config: {
                GameHub: {},
            },
        });

        const alicePrivateKey = PrivateKey.random();
        const alice = alicePrivateKey.toPublicKey();

        await appChain.start();

        appChain.setSigner(alicePrivateKey);

        const gameHub = appChain.runtime.resolve('GameHub');

        // const dummieField: GameField = new GameField({
        //     cells: [...new Array(FIELD_SIZE)].map(
        //         (elem) => new GameCell({ value: UInt64.from(0) })
        //     ),
        // });

        const bricks: Bricks = new Bricks({
            bricks: [...new Array(MAX_BRICKS)].map(
                (elem) =>
                    new Brick({
                        pos: {
                            x: Int64.from(0),
                            y: Int64.from(0),
                        },
                        value: UInt64.from(1),
                    })
            ),
        });

        bricks.bricks[0] = new Brick({
            pos: new IntPoint({
                x: Int64.from(125),
                y: Int64.from(130),
            }),
            value: UInt64.from(2),
        });

        bricks.bricks[1] = new Brick({
            pos: new IntPoint({
                x: Int64.from(136),
                y: Int64.from(70),
            }),
            value: UInt64.from(2),
        });

        bricks.bricks[2] = new Brick({
            pos: new IntPoint({
                x: Int64.from(150),
                y: Int64.from(156),
            }),
            value: UInt64.from(2),
        });

        // bricks.bricks[1] = new Brick({
        //     pos: new IntPoint({
        //         x: Int64.from(400),
        //         y: Int64.from(400),
        //     }),
        //     value: UInt64.from(1),
        // });

        let uiUserInput = [
            1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2,
            0, 0, 0, 0, 0, 0, 0, 0,
        ];

        let userInput = new GameInputs({
            tiks: uiUserInput.map(
                (elem) => new Tick({ action: UInt64.from(elem) })
            ),
        });

        // let dummieInput: GameInputs = new GameInputs({
        //     tiks: [...new Array(GAME_LENGTH)].map(
        //         (elem) => new Tick({ action: UInt64.from(0) })
        //     ),
        // });

        const gameProof = await mockProof(checkGameRecord(bricks, userInput));

        console.log(JSON.stringify(gameProof.toJSON()));

        const tx1 = await appChain.transaction(alice, () => {
            gameHub.addGameResult(gameProof);
        });

        await tx1.sign();
        await tx1.send();

        const block = await appChain.produceBlock();

        const lastSeed =
            (await appChain.query.runtime.GameHub.lastSeed.get()) ??
            UInt64.from(0);
        console.log(lastSeed);

        const gameRecordKey: GameRecordKey = new GameRecordKey({
            seed: lastSeed,
            player: alice,
        });

        console.log(gameRecordKey);

        const userScore =
            await appChain.query.runtime.GameHub.gameRecords.get(gameRecordKey);

        console.log(userScore?.toBigInt());
    });
});