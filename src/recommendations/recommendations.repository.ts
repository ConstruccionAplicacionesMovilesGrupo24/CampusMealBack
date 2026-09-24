import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationAlternative } from './entities/recommendation-alternative.entity';
import { RecommendationRun } from './entities/recommendation-run.entity';
import { ExplanationType } from './enums/explanation-type.enum';
import { RankedAlternative } from './recommendation-candidate';

@Injectable()
export class RecommendationsRepository {
  constructor(
    @InjectRepository(RecommendationRun)
    private readonly runs: Repository<RecommendationRun>,
    @InjectRepository(RecommendationAlternative)
    private readonly alternatives: Repository<RecommendationAlternative>,
  ) {}

  /** Persists the run and its alternatives (if any) and returns the run's id. */
  async saveRun(
    userId: string,
    availableMinutes: number,
    maximumBudget: number,
    mainExplanation: string,
    explanationType: ExplanationType | null,
    alternatives: RankedAlternative[],
  ): Promise<string> {
    const run = await this.runs.save(
      this.runs.create({
        userId,
        availableMinutes,
        maximumBudget,
        mainExplanation,
        explanationType,
      }),
    );

    if (alternatives.length > 0) {
      await this.alternatives.save(
        alternatives.map((alternative) =>
          this.alternatives.create({
            recommendationId: run.id,
            type: alternative.type,
            rank: alternative.rank,
            score: alternative.score,
            recommended: alternative.recommended,
            estimatedMinutes: alternative.estimatedMinutes,
            estimatedCost: alternative.estimatedCost,
            metadata: alternative.metadata,
          }),
        ),
      );
    }

    return run.id;
  }
}
