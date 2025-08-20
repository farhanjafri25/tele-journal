import { BaseEntity } from "../../../database/base/base.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { Column, Entity, PrimaryGeneratedColumn, ColumnOptions, ManyToOne } from "typeorm";

// Custom transformer for vector data
const VectorTransformer = {
  to: (value: number[] | null): string | null => {
    if (!value) return null;
    return `[${value.join(',')}]`;
  },
  from: (value: string | null): number[] | null => {
    if (!value) return null;
    // Remove brackets and split by comma
    const cleanValue = value.replace(/^\[|\]$/g, '');
    return cleanValue.split(',').map(Number);
  }
};


@Entity('journal')
export class JournalEntity extends BaseEntity {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id: number;

    @Column({ type: 'bigint', name: 'user_id', nullable: false })
    userId: number;

    @Column({ type: 'text', name: 'journal_entry', nullable: false })
    entry: string;

    @Column({type: 'text', array: true, nullable  : true, default: []})
    tags?: string[];

    @Column({
        type: 'text',
        nullable: true,
        transformer: VectorTransformer
    })
    embeddings?: number[];

    @ManyToOne(() => UserEntity, (user) => user.journals, {
        onDelete: 'CASCADE',})
    user: UserEntity;
}