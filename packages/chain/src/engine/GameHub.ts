import {
    RuntimeModule,
    runtimeModule,
    state,
    runtimeMethod,
} from '@proto-kit/module';
import { State, StateMap, assert } from '@proto-kit/protocol';
import { UInt64, PublicKey, Provable, Proof, Bool } from 'o1js';
import {
    Competition,
    GameRecordKey,
    LeaderboardIndex,
    LeaderboardScore,
} from '../arkanoid/types';

import { Balances } from '../framework/balances';

import { inject } from 'tsyringe';

export interface IScoreable {
    score: UInt64;
}

@runtimeModule()
export class Gamehub<
    PublicInput,
    PublicOutput extends IScoreable,
    GameProof extends Proof<PublicInput, PublicOutput>,
> extends RuntimeModule<unknown> {
    // CompetitionId -> competition
    @state() public competitions = StateMap.from<UInt64, Competition>(
        UInt64,
        Competition
    );
    @state() public lastCompetitonId = State.from<UInt64>(UInt64);

    /// compettitionId + User => Record
    @state() public gameRecords = StateMap.from<GameRecordKey, UInt64>(
        GameRecordKey,
        UInt64
    );

    /// competitionId + User => isRegistered
    @state() public registrations = StateMap.from<GameRecordKey, Bool>(
        GameRecordKey,
        Bool
    );
    /// (competitionId, Unsorted index) => user result
    @state() public leaderboard = StateMap.from<
        LeaderboardIndex,
        LeaderboardScore
    >(LeaderboardIndex, LeaderboardScore);
    @state() public seeds = StateMap.from<UInt64, UInt64>(UInt64, UInt64);
    @state() public lastSeed = State.from<UInt64>(UInt64);
    @state() public lastUpdate = State.from<UInt64>(UInt64);

    public leaderboardSize = 10;

    public constructor(@inject('Balances') private balances: Balances) {
        super();
    }

    @runtimeMethod()
    public updateSeed(seed: UInt64): void {
        const lastSeedIndex = this.lastSeed.get().orElse(UInt64.from(0));
        this.seeds.set(lastSeedIndex, seed);
        this.lastSeed.set(lastSeedIndex.add(1));
    }

    /**
     * Creates new game competition
     *
     * @param competition - Competition to create
     */
    @runtimeMethod()
    public createCompetition(competition: Competition): void {
        this.competitions.set(
            this.lastCompetitonId.get().orElse(UInt64.from(0)),
            competition
        );
        this.lastCompetitonId.set(
            this.lastCompetitonId.get().orElse(UInt64.from(0)).add(1)
        );
    }

    @runtimeMethod()
    public register(competitionId: UInt64): void {
        this.registrations.set(
            new GameRecordKey({
                competitionId,
                player: this.transaction.sender,
            }),
            Bool(true)
        );
    }

    /**
     * Adds game record to a competition
     *
     * @param competitionId - Competition id to add record to
     * @param newScore - Score to be added
     */
    @runtimeMethod()
    public addGameResult(
        competitionId: UInt64,
        gameRecordProof: GameProof
    ): void {
        gameRecordProof.verify();

        const gameKey = new GameRecordKey({
            competitionId,
            player: this.transaction.sender,
        });

        // Check for registration
        let registrationNeeded =
            this.competitions.get(competitionId).value.prereg;
        let userRegistration = this.registrations.get(gameKey).value;

        assert(registrationNeeded.not().or(userRegistration));

        const currentScore = this.gameRecords.get(gameKey).value;
        let newScore = gameRecordProof.publicOutput.score;

        if (currentScore < newScore) {
            // Do we need provable here?
            this.gameRecords.set(gameKey, newScore);

            let looserIndex = UInt64.from(0);
            let looserScore = UInt64.from(0);

            for (let i = 0; i < this.leaderboardSize; i++) {
                const leaderboardKey = new LeaderboardIndex({
                    competitionId,
                    index: UInt64.from(i),
                });
                const gameRecord = this.leaderboard.get(leaderboardKey);

                const result = gameRecord.orElse(
                    new LeaderboardScore({
                        score: UInt64.from(0),
                        player: PublicKey.empty(),
                    })
                );

                looserIndex = Provable.if(
                    result.score.lessThan(looserScore),
                    UInt64.from(i),
                    looserIndex
                );
                looserScore = Provable.if(
                    result.score.lessThan(looserScore),
                    UInt64.from(i),
                    looserScore
                );
            }

            const looserKey = new LeaderboardIndex({
                competitionId,
                index: looserIndex,
            });

            this.leaderboard.set(
                looserKey,
                new LeaderboardScore({
                    score: newScore,
                    player: this.transaction.sender,
                })
            );
        }
    }
}