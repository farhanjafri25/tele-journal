import { Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

export class BaseEntity {
    @CreateDateColumn({type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP'})
    createdAt: Date;

    @UpdateDateColumn({type: 'timestamp', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP'})
    updatedAt: Date;

    @Column({type: 'boolean', name: 'is_deleted', default: false})
    isDeleted: boolean;
}